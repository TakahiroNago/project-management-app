"use client";

import {
  type Announcements,
  type CollisionDetection,
  closestCorners,
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  MouseSensor,
  pointerWithin,
  rectIntersection,
  TouchSensor,
  type UniqueIdentifier,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { useRouter } from "next/navigation";
import { useId, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  type ColumnOrder,
  findColumn,
  groupIntoColumns,
  moveTaskInColumns,
  TASK_COLUMNS,
  type TaskColumn,
} from "@/domain/task-position";
import { moveTaskAction } from "@/features/tasks/actions";
import { TaskDialogs, useTaskDialogs } from "@/features/tasks/components/task-dialogs";
import type { AssignableMember, TaskListItem } from "@/features/tasks/queries";
import { m } from "@/i18n";
import { KanbanCard } from "./kanban-card";
import { KanbanColumn } from "./kanban-column";

const isColumn = (id: UniqueIdentifier): id is TaskColumn =>
  (TASK_COLUMNS as readonly UniqueIdentifier[]).includes(id);

/**
 * カンバンボード。
 * ドラッグ中はローカルの並びを即座に更新し（楽観的更新）、ドロップ時にサーバーへ保存する。
 * 保存に失敗した場合はドラッグ前の並びに戻す。
 * サーバーの最新データ（props）は、ドラッグ中・保存中でないときにローカルの並びへ反映する
 * （ドラッグ中に再描画で並びが巻き戻ったり、ドラッグが中断されたりしないようにするため）。
 */
export function KanbanBoard({
  projectId,
  tasks,
  members,
  today,
}: {
  projectId: string;
  tasks: TaskListItem[];
  members: AssignableMember[];
  today: string;
}) {
  const router = useRouter();
  const dndId = useId();
  const dialogs = useTaskDialogs();
  const [isSaving, startTransition] = useTransition();

  const tasksById = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);
  const [columns, setColumns] = useState<ColumnOrder>(() => groupIntoColumns(tasks));
  const [activeId, setActiveId] = useState<string | null>(null);

  // props が変わったらローカルの並びを作り直す（React の「props の変化に応じて state を調整する」パターン）
  const [syncedTasks, setSyncedTasks] = useState(tasks);
  if (syncedTasks !== tasks && activeId === null && !isSaving) {
    setSyncedTasks(tasks);
    setColumns(groupIntoColumns(tasks));
  }
  // ドラッグ開始時の並び（キャンセル・保存失敗時に戻す）
  const snapshot = useRef<ColumnOrder | null>(null);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    // スマートフォンでは長押しでドラッグ開始（通常のスクロールを妨げない）
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  /**
   * 衝突判定: まずポインター（キーボード操作時はカードの矩形）がどの列にあるかを決め、
   * その列のカードの中から最も近いものを選ぶ。カードがなければ列そのものを返す。
   * （列全体もドロップ先のため、単純な closestCorners では列が選ばれて並べ替えできないことがある）
   */
  const collisionDetection: CollisionDetection = (args) => {
    const columnContainers = args.droppableContainers.filter((container) => isColumn(container.id));
    const columnHit =
      pointerWithin({ ...args, droppableContainers: columnContainers })[0] ??
      rectIntersection({ ...args, droppableContainers: columnContainers })[0];
    if (!columnHit || !isColumn(columnHit.id)) return closestCorners(args);

    const ids = new Set<UniqueIdentifier>(columns[columnHit.id]);
    const cards = args.droppableContainers.filter((container) => ids.has(container.id));
    if (cards.length === 0) return [columnHit];
    return closestCorners({ ...args, droppableContainers: cards });
  };

  function locate(id: UniqueIdentifier) {
    const current = columns;
    const column = isColumn(id) ? id : findColumn(current, String(id));
    if (!column) return null;
    const index = isColumn(id) ? current[column].length - 1 : current[column].indexOf(String(id));
    return { column, label: m.task.status[column], position: index + 1 };
  }

  const titleOf = (id: UniqueIdentifier) => tasksById.get(String(id))?.title ?? "";

  const announcements: Announcements = {
    onDragStart: ({ active }) => {
      const at = locate(active.id);
      return at ? m.task.dnd.pickedUp(titleOf(active.id), at.label, at.position) : undefined;
    },
    onDragOver: ({ active }) => {
      const at = locate(active.id);
      return at ? m.task.dnd.movedOver(titleOf(active.id), at.label, at.position) : undefined;
    },
    onDragEnd: ({ active }) => {
      const at = locate(active.id);
      return at ? m.task.dnd.dropped(titleOf(active.id), at.label, at.position) : undefined;
    },
    onDragCancel: ({ active }) => m.task.dnd.cancelled(titleOf(active.id)),
  };

  function onDragStart({ active }: DragStartEvent) {
    snapshot.current = columns;
    setActiveId(String(active.id));
  }

  // 列をまたぐ移動は、ドラッグ中に移動先の列へ仮に移して隙間を表示する
  function onDragOver({ active, over }: DragOverEvent) {
    if (!over) return;
    const id = String(active.id);
    setColumns((current) => {
      const from = findColumn(current, id);
      const to = isColumn(over.id) ? over.id : findColumn(current, String(over.id));
      if (!from || !to || from === to) return current;
      const index = isColumn(over.id) ? current[to].length : current[to].indexOf(String(over.id));
      return moveTaskInColumns(current, id, to, index);
    });
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    const id = String(active.id);
    const before = snapshot.current;
    setActiveId(null);
    snapshot.current = null;
    if (!before) return;

    // 同じ列の中での並べ替えを確定する
    let next = columns;
    const column = findColumn(next, id);
    if (column && over && !isColumn(over.id)) {
      const from = next[column].indexOf(id);
      const to = next[column].indexOf(String(over.id));
      if (to !== -1 && from !== to) next = { ...next, [column]: arrayMove(next[column], from, to) };
    }
    if (!column) return;

    const index = next[column].indexOf(id);
    const originalColumn = findColumn(before, id);
    if (originalColumn === column && before[column].indexOf(id) === index) {
      setColumns(before);
      return;
    }

    setColumns(next);
    startTransition(async () => {
      const result = await moveTaskAction(id, { status: column, index });
      if (!result.ok) {
        setColumns(before);
        toast.error(result.error);
      }
      router.refresh();
    });
  }

  function onDragCancel() {
    if (snapshot.current) setColumns(snapshot.current);
    snapshot.current = null;
    setActiveId(null);
  }

  const activeTask = activeId ? tasksById.get(activeId) : undefined;

  return (
    <>
      <p id={`${dndId}-hint`} className="sr-only">
        {m.task.boardHint}
      </p>
      <DndContext
        id={dndId}
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={onDragCancel}
        accessibility={{ announcements, screenReaderInstructions: { draggable: m.task.boardHint } }}
      >
        <div
          className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-4 sm:mx-0 sm:px-0 lg:grid lg:grid-cols-3 lg:overflow-visible"
          data-testid="kanban-board"
        >
          {TASK_COLUMNS.map((status) => (
            <KanbanColumn
              key={status}
              status={status}
              tasks={columns[status].flatMap((id) => tasksById.get(id) ?? [])}
              today={today}
              onAdd={() => dialogs.openCreate(status)}
              onOpenTask={dialogs.openDetail}
            />
          ))}
        </div>
        <DragOverlay>
          {activeTask && <KanbanCard task={activeTask} today={today} overlay />}
        </DragOverlay>
      </DndContext>
      <TaskDialogs dialogs={dialogs} projectId={projectId} members={members} today={today} />
    </>
  );
}
