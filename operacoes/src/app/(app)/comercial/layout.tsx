import { CrmTabs } from "@/components/crm/tabs";

export default function ComercialLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <CrmTabs />
      {children}
    </>
  );
}
