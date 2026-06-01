// components/Sidebar.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  IconDashboard,
  IconFlask,
  IconRadar,
  IconChart,
  IconList,
  IconSettings,
  IconBolt,
  IconAlert,
  IconDesk,
  IconGrid,
  IconPulse,
} from "./ui/icons";

const NAV = [
  { href: "/", label: "Dashboard", Icon: IconDashboard },
  { href: "/research", label: "Research Lab", Icon: IconFlask },
  { href: "/edge-map", label: "Edge Map", Icon: IconGrid },
  { href: "/diagnostics", label: "Diagnostics", Icon: IconPulse },
  { href: "/scanner", label: "Market Scanner", Icon: IconRadar },
  { href: "/signal-desk", label: "Signal Desk", Icon: IconDesk },
  { href: "/why-not-trade", label: "Why Not Trade", Icon: IconAlert },
  { href: "/signal-center", label: "Signal Center", Icon: IconBolt },
  { href: "/performance", label: "Performance", Icon: IconChart },
  { href: "/paper", label: "Paper Trades", Icon: IconList },
  { href: "/settings", label: "Settings", Icon: IconSettings },
];

export default function Sidebar() {
  const path = usePathname();
  return (
    <aside className="sidebar">
      <div className="px-4 py-4 border-b border-line">
        <div className="flex items-center gap-2.5">
          <span className="dot live" style={{ background: "#39c0ed" }} />
          <div>
            <div className="text-bright font-semibold text-[13px] tracking-tight leading-none">
              QUANT TERMINAL
            </div>
            <div className="label mt-1">research · paper · alerts</div>
          </div>
        </div>
      </div>

      <nav className="flex flex-col gap-1 p-3 flex-1 overflow-y-auto">
        {NAV.map(({ href, label, Icon }) => {
          const active = href === "/" ? path === "/" : path.startsWith(href);
          return (
            <Link key={href} href={href} className="nav-item focusable" data-active={active}>
              <span className="nav-ico">
                <Icon width={17} height={17} />
              </span>
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="p-3 border-t border-line">
        <p className="text-[11px] text-muted leading-relaxed">
          Research &amp; paper only. No orders, no keys. Backtests don&apos;t guarantee future results.
        </p>
      </div>
    </aside>
  );
}
