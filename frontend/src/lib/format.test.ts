import { describe, expect, it } from "vitest";
import { fmtCountdown, fmtDelta, fmtPrice, fmtTime, globexOpen, nextMilestone, nyParts, statOk } from "./format";

describe("format", () => {
  it("prices follow the tick", () => {
    expect(fmtPrice(24150, 0.25)).toBe("24,150.00");
    expect(fmtPrice(3412.3, 0.1)).toBe("3,412.3");
    expect(fmtDelta(-44, 0.25)).toBe("−44.00");
    expect(fmtPrice(null)).toBe("—");
  });
  it("times render in New York across DST", () => {
    expect(fmtTime("2026-09-11T09:30:00-04:00")).toBe("09:30");
    expect(fmtTime("2026-03-08T12:00:00Z")).toBe("08:00"); // DST starts 2 AM that day → EDT
    expect(fmtTime("2026-03-08T06:30:00Z")).toBe("01:30"); // still EST before the jump
    expect(fmtTime("2026-11-01T12:00:00Z")).toBe("07:00"); // back to EST after 2 AM
  });
  it("countdown never counts into a closed session", () => {
    // Saturday 10:00 ET → Monday 09:00
    const sat = new Date("2026-09-12T14:00:00Z");
    const m = nextMilestone(sat, ["09:00", "09:30", "12:00"]);
    expect(m.label).toBe("9:00 window open");
    expect(m.seconds).toBe(2 * 86400 - 3600);
    // Friday 08:00 ET → 09:00 in one hour
    const fri = new Date("2026-09-11T12:00:00Z");
    expect(nextMilestone(fri, ["09:00", "09:30", "12:00"]).seconds).toBe(3600);
    // Friday 13:00 ET → Monday 09:00 (12:00 already passed, Friday 17:00 close)
    expect(nextMilestone(new Date("2026-09-11T17:00:00Z"), ["09:00", "09:30", "12:00"]).label).toBe("9:00 window open");
    expect(fmtCountdown(3725)).toBe("01:02:05");
  });
  it("globex clock", () => {
    expect(globexOpen({ dow: 0, h: 17, mi: 0 })).toBe(false);
    expect(globexOpen({ dow: 0, h: 18, mi: 0 })).toBe(true);
    expect(globexOpen({ dow: 3, h: 17, mi: 30 })).toBe(false);
    expect(globexOpen({ dow: 5, h: 16, mi: 59 })).toBe(true);
    expect(globexOpen({ dow: 5, h: 17, mi: 0 })).toBe(false);
    expect(nyParts(new Date("2026-03-08T07:30:00Z")).h).toBe(3); // 2:30 EST does not exist → 3:30 EDT
  });
  it("stats without n or dates are not renderable", () => {
    expect(statOk({ value: 0.6, n: 41, from: "2026-01-01", to: "2026-06-01", unit: "p" })).toBe(true);
    expect(statOk({ value: 0.6, n: 41, from: null, to: null, unit: "p" })).toBe(false);
    expect(statOk({ value: null, n: 0, from: null, to: null, unit: "" })).toBe(false);
  });
});
