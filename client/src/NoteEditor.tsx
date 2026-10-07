import { useEffect, useRef } from "react";
import { Bold, Italic, Underline, Heading1, Heading2, Heading3, List, ListOrdered, Link as LinkIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

const TOOLBAR_ACTIONS: Array<{
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  command: string;
  commandValue?: string;
}> = [
  { icon: Bold, label: "Bold", command: "bold" },
  { icon: Italic, label: "Italic", command: "italic" },
  { icon: Underline, label: "Underline", command: "underline" },
  { icon: Heading1, label: "Heading 1", command: "formatBlock", commandValue: "h1" },
  { icon: Heading2, label: "Heading 2", command: "formatBlock", commandValue: "h2" },
  { icon: Heading3, label: "Heading 3", command: "formatBlock", commandValue: "h3" },
  { icon: List, label: "Bulleted list", command: "insertUnorderedList" },
  { icon: ListOrdered, label: "Numbered list", command: "insertOrderedList" },
];

export function NoteEditor({ value, onChange }: { value: string; onChange: (html: string) => void }) {
  const editorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    // Comparing against the live DOM (not a ref snapshot) is what makes this
    // safe on every render: a keystroke's onInput already wrote `value` into
    // the DOM before this effect re-runs, so the two already match and we
    // skip — no caret jump. Only an externally-changed value (initial mount,
    // switching notes) actually differs, and only then do we write it in.
    if (el.innerHTML !== value) {
      el.innerHTML = value;
    }
  }, [value]);

  function handleInput() {
    onChange(editorRef.current?.innerHTML ?? "");
  }

  function runCommand(command: string, commandValue?: string) {
    editorRef.current?.focus();
    document.execCommand(command, false, commandValue);
    handleInput();
  }

  function handleLink() {
    const url = window.prompt("Link URL");
    if (!url) return;
    runCommand("createLink", url);
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden rounded-lg border">
      <div className="flex flex-wrap gap-1 border-b bg-muted/30 p-1.5" data-tour="notes-toolbar">
        {TOOLBAR_ACTIONS.map(({ icon: Icon, label, command, commandValue }) => (
          <Button
            key={label}
            type="button"
            variant="ghost"
            size="icon-sm"
            title={label}
            // Toolbar clicks must not steal focus from the editor, or the
            // text selection execCommand needs to act on is lost first.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => runCommand(command, commandValue)}
          >
            <Icon />
          </Button>
        ))}
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          title="Link"
          onMouseDown={(e) => e.preventDefault()}
          onClick={handleLink}
        >
          <LinkIcon />
        </Button>
      </div>
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        className="min-h-64 flex-1 overflow-y-auto p-4 text-sm outline-none [&_a]:text-primary [&_a]:underline [&_h1]:text-xl [&_h1]:font-semibold [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:text-base [&_h3]:font-semibold [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5"
        onInput={handleInput}
      />
    </div>
  );
}
