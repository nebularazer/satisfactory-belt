export function InspectorSink() {
  return (
    <section aria-label="Surplus sinking" className="space-y-2 text-xs text-muted-foreground">
      <p>Consumes surplus after production needs are met.</p>
      <p>
        Automatic suppliers slow down when demand falls. To keep production available for surplus,
        set an output or machine limit on the supplier.
      </p>
    </section>
  );
}
