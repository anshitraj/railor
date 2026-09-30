/** Renders `backticked` spans in a plain string as <code>, so copy can stay a string. */
export function InlineCode({ children }: { children: string }) {
  return (
    <>
      {children.split(/`([^`]+)`/g).map((part, i) =>
        i % 2 === 1 ? <code key={i}>{part}</code> : part,
      )}
    </>
  );
}
