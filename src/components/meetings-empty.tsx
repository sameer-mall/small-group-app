export function MeetingsEmpty() {
  return (
    <div className="bg-card rounded-card shadow-card p-6 text-center">
      <h2 className="font-serif text-xl font-semibold">No meetings yet</h2>
      <p className="text-muted-foreground mt-2 text-sm">
        When your group plans a week, it&apos;ll show up here.
      </p>
    </div>
  );
}
