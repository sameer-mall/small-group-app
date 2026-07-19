export function WaitingForApproval({ groupName }: { groupName: string }) {
  return (
    <div className="bg-card rounded-card shadow-card mx-auto w-full max-w-sm p-6 text-center">
      <span className="bg-success-tint text-success rounded-full inline-block px-3 py-1 text-xs font-semibold">
        Waiting for approval
      </span>
      <h2 className="font-serif text-xl font-semibold mt-4">Request sent</h2>
      <p className="text-muted-foreground mt-2 text-sm">
        An admin will let you in — check back soon.
      </p>
      <p className="text-strong mt-3 text-sm font-medium">{groupName}</p>
    </div>
  );
}
