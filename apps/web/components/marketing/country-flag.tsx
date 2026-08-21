export type CountryCode = "IN" | "AE" | "NG" | "SG" | "EU" | "GB" | "WORLD";

const labels: Record<CountryCode, string> = {
  IN: "India",
  AE: "United Arab Emirates",
  NG: "Nigeria",
  SG: "Singapore",
  EU: "European Union",
  GB: "United Kingdom",
  WORLD: "Global",
};

export function CountryFlag({
  code,
  size = 22,
}: {
  code: CountryCode;
  size?: number;
}) {
  const common = {
    width: Math.round(size * 1.36),
    height: size,
    viewBox: "0 0 34 25",
    role: "img" as const,
    "aria-label": labels[code],
    className: "shrink-0 overflow-hidden rounded-[4px] border border-black/10 shadow-[0_1px_2px_rgba(28,27,25,.12)]",
  };

  if (code === "IN") {
    return (
      <svg {...common}>
        <path fill="#FF9933" d="M0 0h34v8.34H0z" />
        <path fill="#fff" d="M0 8.33h34v8.34H0z" />
        <path fill="#138808" d="M0 16.66h34V25H0z" />
        <circle cx="17" cy="12.5" r="2.45" fill="none" stroke="#000080" strokeWidth=".75" />
        <circle cx="17" cy="12.5" r=".55" fill="#000080" />
      </svg>
    );
  }

  if (code === "AE") {
    return (
      <svg {...common}>
        <path fill="#00732F" d="M8 0h26v8.34H8z" />
        <path fill="#fff" d="M8 8.33h26v8.34H8z" />
        <path fill="#000" d="M8 16.66h26V25H8z" />
        <path fill="#EF3340" d="M0 0h9v25H0z" />
      </svg>
    );
  }

  if (code === "NG") {
    return (
      <svg {...common}>
        <path fill="#008751" d="M0 0h11.34v25H0zM22.66 0H34v25H22.66z" />
        <path fill="#fff" d="M11.33 0h11.34v25H11.33z" />
      </svg>
    );
  }

  if (code === "SG") {
    return (
      <svg {...common}>
        <path fill="#EF3340" d="M0 0h34v12.5H0z" />
        <path fill="#fff" d="M0 12.5h34V25H0z" />
        <circle cx="8" cy="6.2" r="3.7" fill="#fff" />
        <circle cx="9.5" cy="5.8" r="3.15" fill="#EF3340" />
        {([[-0.3, -2.1], [1.45, -1.05], [1.1, 1], [-1.1, 1.25], [-1.8, -0.65]] as const).map(([x, y], index) => (
          <circle key={index} cx={8 + x} cy={6.2 + y} r=".45" fill="#fff" />
        ))}
      </svg>
    );
  }

  if (code === "EU") {
    return (
      <svg {...common}>
        <path fill="#003399" d="M0 0h34v25H0z" />
        {Array.from({ length: 12 }, (_, index) => {
          const angle = (index / 12) * Math.PI * 2 - Math.PI / 2;
          return <circle key={index} cx={(17 + Math.cos(angle) * 5.2).toFixed(3)} cy={(12.5 + Math.sin(angle) * 5.2).toFixed(3)} r=".72" fill="#FFCC00" />;
        })}
      </svg>
    );
  }

  if (code === "GB") {
    return (
      <svg {...common}>
        <path fill="#012169" d="M0 0h34v25H0z" />
        <path stroke="#fff" strokeWidth="5" d="m0 0 34 25M34 0 0 25" />
        <path stroke="#C8102E" strokeWidth="2" d="m0 0 34 25M34 0 0 25" />
        <path stroke="#fff" strokeWidth="8" d="M17 0v25M0 12.5h34" />
        <path stroke="#C8102E" strokeWidth="4.5" d="M17 0v25M0 12.5h34" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <path fill="#2775CA" d="M0 0h34v25H0z" />
      <circle cx="17" cy="12.5" r="7.5" fill="none" stroke="#fff" strokeWidth="1.2" />
      <path d="M9.8 12.5h14.4M17 5c2.2 2.2 3.3 4.7 3.3 7.5S19.2 17.8 17 20c-2.2-2.2-3.3-4.7-3.3-7.5S14.8 7.2 17 5Z" fill="none" stroke="#fff" strokeWidth="1" />
    </svg>
  );
}
