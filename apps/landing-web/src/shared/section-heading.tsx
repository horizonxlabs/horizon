export function SectionHeading({
  eyebrow,
  title,
  description
}: {
  eyebrow?: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="max-w-2xl">
      {eyebrow ? (
        <p className="text-primary text-sm font-semibold tracking-widest uppercase">{eyebrow}</p>
      ) : null}
      <h2 className="mt-3 text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
        {title}
      </h2>
      {description ? (
        <p className="text-muted mt-5 text-lg leading-relaxed text-pretty">{description}</p>
      ) : null}
    </div>
  );
}
