import { Paperclip } from "lucide-react";
import { useRef } from "react";

export function WorkspaceAttachmentButton({
  disabled,
  onFiles
}: {
  disabled: boolean;
  onFiles: (files: FileList) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <button
        type="button"
        className="vibe-composer-attach"
        title="Attach files"
        aria-label="Attach files"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
      >
        <Paperclip size={17} aria-hidden="true" />
      </button>
      <input
        ref={inputRef}
        className="vibe-composer-file-input"
        type="file"
        multiple
        tabIndex={-1}
        onChange={(event) => {
          if (event.currentTarget.files) onFiles(event.currentTarget.files);
          event.currentTarget.value = "";
        }}
      />
    </>
  );
}
