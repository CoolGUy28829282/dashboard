// Series primitives for Lightweight Charts v5: range boxes with EQ lines, horizontal level lines,
// vertical time markers and the current-time line. Drawn in bitmap space so hairlines stay crisp.
import type { IChartApi, ISeriesApi, ISeriesPrimitive, SeriesAttachedParameter, Time } from "lightweight-charts";

export type Box = { id: string; label: string; start: number; end: number; h: number; l: number; eq: number; live: boolean; kind: string };
export type Level = { id: string; label: string; price: number };
export type VLine = { time: number; label: string; kind: string };
export type Zone = { lo: number; hi: number; from: number; label: string };

export type Palette = { text: string; muted: string; hairline: string; accent: string; box: string; boxLive: string; exec: string; zone: string; grid: string };

type Ctx = { chart: IChartApi; series: ISeriesApi<"Candlestick">; requestUpdate: () => void };

export class RangePrimitive implements ISeriesPrimitive<Time> {
  private ctx: Ctx | null = null;
  constructor(
    public boxes: Box[],
    public levels: Level[],
    public vlines: VLine[],
    public zones: Zone[],
    public nowTs: number | null,
    public palette: Palette,
  ) {}
  attached(p: SeriesAttachedParameter<Time>) {
    this.ctx = { chart: p.chart, series: p.series as ISeriesApi<"Candlestick">, requestUpdate: p.requestUpdate };
  }
  detached() {
    this.ctx = null;
  }
  update(partial: Partial<Pick<RangePrimitive, "boxes" | "levels" | "vlines" | "zones" | "nowTs" | "palette">>) {
    Object.assign(this, partial);
    this.ctx?.requestUpdate();
  }
  updateAllViews() {}
  paneViews() {
    return [{ zOrder: () => "bottom" as const, renderer: () => this.renderer() }];
  }
  private renderer() {
    const ctx = this.ctx;
    if (!ctx) return null;
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    return {
      draw(target: any) {
        target.useBitmapCoordinateSpace((scope: any) => {
          const c: CanvasRenderingContext2D = scope.context;
          const hr = scope.horizontalPixelRatio as number, vr = scope.verticalPixelRatio as number;
          const W = scope.bitmapSize.width as number;
          const ts = ctx.chart.timeScale();
          const x = (t: number) => {
            const v = ts.timeToCoordinate(t as Time);
            return v === null ? null : v * hr;
          };
          const y = (p: number) => {
            const v = ctx.series.priceToCoordinate(p);
            return v === null ? null : v * vr;
          };
          const range = ts.getVisibleRange();
          const xClamp = (t: number, fallback: number) => {
            const v = x(t);
            if (v !== null) return v;
            if (!range) return fallback;
            return t < (range.from as number) ? 0 : W;
          };
          c.font = `${11 * hr}px "Geist Variable", system-ui, sans-serif`;
          // range boxes
          for (const b of self.boxes) {
            const x1 = xClamp(b.start, 0), x2 = xClamp(b.end, W);
            const yh = y(b.h), yl = y(b.l), ye = y(b.eq);
            if (yh === null || yl === null || ye === null) continue;
            c.fillStyle = b.kind === "execution" ? self.palette.exec : b.live ? self.palette.boxLive : self.palette.box;
            c.fillRect(x1, yh, Math.max(x2 - x1, 1), yl - yh);
            c.strokeStyle = self.palette.hairline;
            c.lineWidth = 1 * hr;
            c.strokeRect(x1, yh, Math.max(x2 - x1, 1), yl - yh);
            c.setLineDash([3 * hr, 3 * hr]);
            c.beginPath();
            c.moveTo(x1, ye);
            c.lineTo(x2, ye);
            c.stroke();
            c.setLineDash([]);
            c.fillStyle = self.palette.muted;
            c.fillText(b.label, x1 + 4 * hr, yh - 3 * vr);
          }
          // entry zones
          for (const z of self.zones) {
            const x1 = xClamp(z.from, 0), yh = y(z.hi), yl = y(z.lo);
            if (yh === null || yl === null) continue;
            c.fillStyle = self.palette.zone;
            c.fillRect(x1, yh, W - x1, Math.max(yl - yh, 1 * vr));
            c.fillStyle = self.palette.accent;
            c.fillText(z.label, x1 + 4 * hr, yh - 3 * vr);
          }
          // horizontal levels
          for (const l of self.levels) {
            const yy = y(l.price);
            if (yy === null) continue;
            c.strokeStyle = self.palette.hairline;
            c.lineWidth = 1 * hr;
            c.setLineDash([1 * hr, 4 * hr]);
            c.beginPath();
            c.moveTo(0, yy);
            c.lineTo(W, yy);
            c.stroke();
            c.setLineDash([]);
            c.fillStyle = self.palette.muted;
            c.textAlign = "right";
            c.fillText(l.label, W - 4 * hr, yy - 3 * vr);
            c.textAlign = "left";
          }
          // vertical time markers
          const H = scope.bitmapSize.height as number;
          for (const v of self.vlines) {
            const xx = x(v.time);
            if (xx === null) continue;
            c.strokeStyle = v.kind === "reversal" ? self.palette.hairline : self.palette.muted;
            c.globalAlpha = v.kind === "reversal" ? 0.6 : 0.35;
            c.lineWidth = 1 * hr;
            c.beginPath();
            c.moveTo(xx, 0);
            c.lineTo(xx, H);
            c.stroke();
            c.globalAlpha = 1;
            c.save();
            c.translate(xx + 3 * hr, 12 * vr);
            c.fillStyle = self.palette.muted;
            c.fillText(v.label, 0, 0);
            c.restore();
          }
          if (self.nowTs !== null) {
            const xx = x(self.nowTs);
            if (xx !== null) {
              c.strokeStyle = self.palette.accent;
              c.lineWidth = 1 * hr;
              c.beginPath();
              c.moveTo(xx, 0);
              c.lineTo(xx, H);
              c.stroke();
            }
          }
        });
      },
    };
  }
}
