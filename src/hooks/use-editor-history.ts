"use client";

import { useCallback, useRef, useState } from "react";

/**
 * Snapshot-based undo/redo for the contentEditable email editor.
 *
 * `document.execCommand("undo")` only knows about edits the browser itself
 * made. Every toolbar action in this editor mutates the DOM programmatically
 * (`range.insertNode`, `setAttribute`, `innerHTML +=`), and switching editor
 * modes rewrites `innerHTML` wholesale — all invisible to the native stack.
 * That is why the client reported Undo "doesn't consistently undo some of the
 * changes". This hook owns the history instead: every committed mutation
 * pushes an HTML snapshot, so undo works identically for typing, formatting,
 * image edits, and section moves.
 */

const MAX_HISTORY = 80;
/** Typing is coalesced into one entry until this much idle time passes. */
const COALESCE_MS = 500;

export interface EditorHistory {
  canUndo: boolean;
  canRedo: boolean;
  /** Snapshot the current HTML. `coalesce` merges rapid typing into one entry. */
  commit: (html: string, opts?: { coalesce?: boolean }) => void;
  /** Returns the HTML to restore, or null when there is nothing to undo. */
  undo: () => string | null;
  redo: () => string | null;
  /** Seed the stack without creating an undo step (initial load / restore). */
  reset: (html: string) => void;
  depth: number;
}

export function useEditorHistory(initial: string = ""): EditorHistory {
  const stack = useRef<string[]>([initial]);
  const index = useRef(0);
  const lastCommitAt = useRef(0);
  // Whether the entry at the top of the stack was itself produced by a
  // coalescing (typing) commit. Without this, typing straight after a toolbar
  // action merges into that action's snapshot and destroys it — one Ctrl+Z
  // would then undo the typing *and* the image insert or section move.
  const lastWasCoalescible = useRef(false);
  // State only exists to re-render the toolbar's enabled/disabled buttons.
  const [, force] = useState(0);
  const sync = useCallback(() => force((n) => n + 1), []);

  const commit = useCallback(
    (html: string, opts?: { coalesce?: boolean }) => {
      if (stack.current[index.current] === html) return;

      const now = Date.now();
      const shouldMerge =
        opts?.coalesce === true &&
        lastWasCoalescible.current &&
        index.current > 0 &&
        now - lastCommitAt.current < COALESCE_MS;

      // Any new edit invalidates the redo branch.
      stack.current = stack.current.slice(0, index.current + 1);

      if (shouldMerge) {
        stack.current[index.current] = html;
      } else {
        stack.current.push(html);
        if (stack.current.length > MAX_HISTORY) stack.current.shift();
        index.current = stack.current.length - 1;
      }

      lastCommitAt.current = now;
      lastWasCoalescible.current = opts?.coalesce === true;
      sync();
    },
    [sync],
  );

  const undo = useCallback((): string | null => {
    if (index.current <= 0) return null;
    index.current -= 1;
    // Break coalescing so the next keystroke starts a fresh entry.
    lastCommitAt.current = 0;
    lastWasCoalescible.current = false;
    sync();
    return stack.current[index.current];
  }, [sync]);

  const redo = useCallback((): string | null => {
    if (index.current >= stack.current.length - 1) return null;
    index.current += 1;
    lastCommitAt.current = 0;
    lastWasCoalescible.current = false;
    sync();
    return stack.current[index.current];
  }, [sync]);

  const reset = useCallback(
    (html: string) => {
      stack.current = [html];
      index.current = 0;
      lastCommitAt.current = 0;
      lastWasCoalescible.current = false;
      sync();
    },
    [sync],
  );

  return {
    canUndo: index.current > 0,
    canRedo: index.current < stack.current.length - 1,
    commit,
    undo,
    redo,
    reset,
    depth: stack.current.length,
  };
}
