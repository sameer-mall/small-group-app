import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-background p-6 text-center">
      <h1 className="font-serif text-4xl font-semibold tracking-tight">Small Group</h1>
      <p className="text-muted-foreground max-w-sm">
        Meals, prayer, and notes for our weekly small group.
      </p>
      <Button size="lg">Get started</Button>
    </main>
  );
}
