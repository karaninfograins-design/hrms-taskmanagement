import Image from "next/image";

type CompanyLogoProps = { className?: string };

export function CompanyLogo({ className = "" }: CompanyLogoProps) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <div className="relative px-2.5 py-1 rounded-xl bg-gradient-to-r from-slate-50 via-orange-50/50 to-slate-50 border border-slate-200/80 shadow-2xs hover:border-orange-300 transition-all flex items-center h-10">
        <Image
          className="company-logo rounded-md object-contain"
          src="/infograin_logo.jpg"
          alt="Infograins HRMS"
          width={401}
          height={117}
          style={{ width: 145, height: "auto" }}
          priority
        />
      </div>
      <span className="hidden sm:inline-flex items-center gap-1 px-3 py-1 rounded-full bg-gradient-to-r from-orange-500 to-amber-500 text-white text-[10px] font-black uppercase tracking-wider shadow-2xs">
        <span>⚡</span> HRMS Workspace
      </span>
    </div>
  );
}
