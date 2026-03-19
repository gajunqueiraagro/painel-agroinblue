export function Header({ title }: { title: string }) {
  return (
    <header className="sticky top-0 z-40 bg-primary px-4 py-3 shadow-md">
      <div className="max-w-lg mx-auto flex items-center gap-3">
        <span className="text-2xl">🐂</span>
        <h1 className="text-lg font-extrabold text-primary-foreground tracking-wide">
          {title}
        </h1>
      </div>
    </header>
  );
}
