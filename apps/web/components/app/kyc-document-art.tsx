import type { ReactNode } from "react";
import type { DocType } from "../../lib/kyc-documents";

/**
 * Placeholder pictures for the kinds of document a provider asks for. They are
 * generic drawings (a photo block, a few lines, a coloured band), not copies of
 * any government's design, so a person can tell at a glance what to find in
 * their drawer. The words next to them say exactly what is asked.
 */
const LINE = "#e3dccd";
const SKIN = "#e8dfcf";
const SHADE = "#cfc4ad";

function Person({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  return <g>
    <rect x={x} y={y} width={w} height={h} rx={3} fill="#f3eee4" />
    <circle cx={x + w / 2} cy={y + h * 0.38} r={w * 0.22} fill={SHADE} />
    <path d={`M${x + w * 0.16} ${y + h} C${x + w * 0.16} ${y + h * 0.66} ${x + w * 0.84} ${y + h * 0.66} ${x + w * 0.84} ${y + h} Z`} fill={SHADE} />
  </g>;
}

function IdCard({ band, children }: { band: string; children?: ReactNode }) {
  return <>
    <rect x={2} y={3} width={84} height={52} rx={7} fill="#fff" stroke={LINE} strokeWidth={1.5} />
    <path d="M2 10C2 6 4.5 3 9 3H79C83.5 3 86 6 86 10V15H2Z" fill={band} />
    <rect x={10} y={7.5} width={22} height={3.4} rx={1.7} fill="#fff" opacity={0.85} />
    <Person x={10} y={20} w={22} h={28} />
    <rect x={39} y={22} width={38} height={4} rx={2} fill={LINE} />
    <rect x={39} y={30} width={30} height={4} rx={2} fill={LINE} />
    <rect x={39} y={38} width={34} height={4} rx={2} fill={LINE} />
    {children}
  </>;
}

function Art({ type }: { type: DocType }) {
  switch (type) {
    case "aadhaar":
      return <IdCard band="#e58a3a">
        {[0, 1, 2, 3, 4].flatMap((row) => [0, 1, 2, 3, 4].map((col) => ((row * 3 + col * 5) % 4 !== 0 ? <rect key={`${row}-${col}`} x={61 + col * 3.2} y={39 + row * 3} width={2.4} height={2.4} fill="#2d2a26" opacity={0.75} /> : null)))}
      </IdCard>;
    case "pan":
      return <IdCard band="#4d7fd6"><rect x={64} y={40} width={14} height={9} rx={2} fill="#d7e3fa" /></IdCard>;
    case "driving":
      return <IdCard band="#3f9a78"><circle cx={70} cy={44} r={5} fill="none" stroke="#9bd0bb" strokeWidth={2} /><circle cx={70} cy={44} r={1.4} fill="#9bd0bb" /></IdCard>;
    case "id":
      return <IdCard band="#8466cc"><path d="M63 46l5-5 5 5z" fill="#d9cdf3" /></IdCard>;
    case "passport":
      return <>
        <rect x={20} y={2} width={48} height={54} rx={5} fill="#27456b" />
        <rect x={20} y={2} width={5} height={54} rx={2.5} fill="#1d3552" />
        <circle cx={46} cy={24} r={11} fill="none" stroke="#d9b45c" strokeWidth={1.8} />
        <path d="M46 16v16M38 24h16M40.3 18.3l11.4 11.4M51.7 18.3L40.3 29.7" stroke="#d9b45c" strokeWidth={1.2} />
        <rect x={34} y={42} width={24} height={3.4} rx={1.7} fill="#d9b45c" />
      </>;
    case "selfie":
      return <>
        <rect x={27} y={2} width={34} height={54} rx={8} fill="#fff" stroke={LINE} strokeWidth={1.5} />
        <circle cx={44} cy={25} r={8.5} fill={SKIN} stroke={SHADE} strokeWidth={1} />
        <path d="M30 52C30 40 58 40 58 52Z" fill={SKIN} stroke={SHADE} strokeWidth={1} />
        {[[33, 11, 1, 1], [55, 11, -1, 1], [33, 41, 1, -1], [55, 41, -1, -1]].map(([x, y, sx, sy], i) => (
          <path key={i} d={`M${x} ${y! + sy! * 5}V${y}H${x! + sx! * 5}`} fill="none" stroke="#c84420" strokeWidth={1.8} strokeLinecap="round" />
        ))}
      </>;
    case "address":
      return <>
        <rect x={21} y={2} width={46} height={54} rx={5} fill="#fff" stroke={LINE} strokeWidth={1.5} />
        <path d="M44 9l9 7.5H35z" fill="#4d7fd6" />
        <rect x={37} y={16} width={14} height={9} fill="#9db9ea" />
        <rect x={42} y={19} width={4} height={6} fill="#fff" />
        <rect x={28} y={32} width={32} height={3.6} rx={1.8} fill={LINE} />
        <rect x={28} y={39} width={24} height={3.6} rx={1.8} fill={LINE} />
        <rect x={28} y={46} width={28} height={3.6} rx={1.8} fill={LINE} />
      </>;
    case "business":
      return <>
        <rect x={16} y={2} width={56} height={54} rx={5} fill="#fff" stroke={LINE} strokeWidth={1.5} />
        <rect x={21} y={7} width={46} height={44} rx={3} fill="none" stroke="#e5c58b" strokeWidth={1.2} />
        <rect x={30} y={13} width={28} height={4} rx={2} fill={LINE} />
        <rect x={34} y={21} width={20} height={3.4} rx={1.7} fill={LINE} />
        <circle cx={44} cy={38} r={7} fill="#c84420" />
        <path d="M40.4 44l-1.8 8 5.4-3 5.4 3-1.8-8z" fill="#9f3015" />
        <path d="M41 38l2.2 2.2L47.4 36" fill="none" stroke="#fff" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
      </>;
    case "bank":
      return <>
        <path d="M44 4L72 18H16z" fill="#2f6f66" />
        {[24, 34, 44, 54].map((x) => <rect key={x} x={x - 3} y={21} width={6} height={24} rx={1.5} fill="#bfd9d3" />)}
        <rect x={13} y={46} width={62} height={7} rx={2.5} fill="#2f6f66" />
      </>;
    case "funds":
      return <>
        <rect x={9} y={14} width={62} height={34} rx={5} fill="#cfe6d6" stroke="#9fc8ac" strokeWidth={1.2} transform="rotate(-6 40 31)" />
        <rect x={16} y={10} width={62} height={34} rx={5} fill="#e4f2e8" stroke="#9fc8ac" strokeWidth={1.5} />
        <circle cx={47} cy={27} r={9} fill="#fff" stroke="#9fc8ac" strokeWidth={1.4} />
        <path d="M47 21.5v11M50 23.5c-1-1.2-5.5-1.5-5.5 1.2 0 3 6 1.6 6 4.3 0 2.6-4.9 2.4-6.2.9" fill="none" stroke="#4f9a68" strokeWidth={1.5} strokeLinecap="round" />
        <circle cx={22} cy={27} r={2.6} fill="#9fc8ac" />
        <circle cx={72} cy={27} r={2.6} fill="#9fc8ac" />
      </>;
    default:
      return <>
        <path d="M22 2h30l14 14v36a4 4 0 0 1-4 4H22a4 4 0 0 1-4-4V6a4 4 0 0 1 4-4z" fill="#fff" stroke={LINE} strokeWidth={1.5} />
        <path d="M52 2v10a4 4 0 0 0 4 4h10" fill="#f3eee4" stroke={LINE} strokeWidth={1.5} />
        <rect x={26} y={24} width={32} height={3.6} rx={1.8} fill={LINE} />
        <rect x={26} y={32} width={26} height={3.6} rx={1.8} fill={LINE} />
        <rect x={26} y={40} width={30} height={3.6} rx={1.8} fill={LINE} />
      </>;
  }
}

export function DocumentArt({ type, height = 46 }: { type: DocType; height?: number }) {
  return <svg viewBox="0 0 88 58" width={(height * 88) / 58} height={height} aria-hidden="true" focusable="false" style={{ display: "block", flex: "none" }}><Art type={type} /></svg>;
}
