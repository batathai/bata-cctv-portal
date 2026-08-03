export function SignalBars({ score }: { score: number }) {
  const bands = [20, 40, 60, 80];
  const color = score >= 70 ? "#1E9E5A" : score >= 50 ? "#E2A400" : "#D71920";
  return (
    <div className="flex items-end gap-[2px] h-4">
      {[6, 9, 12, 15].map((h, i) => (
        <div
          key={i}
          style={{ width: 3, height: h, background: score >= bands[i] ? color : "#E2E2E2" }}
          className="rounded-[1px]"
        />
      ))}
    </div>
  );
}
