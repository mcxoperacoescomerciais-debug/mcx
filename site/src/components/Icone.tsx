import {
  Briefcase,
  Calculator,
  Camera,
  CircleCheck,
  ClipboardCheck,
  Eye,
  Factory,
  FileText,
  FolderOpen,
  Handshake,
  Landmark,
  LayoutList,
  ListChecks,
  MapPin,
  MessagesSquare,
  Package,
  Receipt,
  Route,
  Search,
  SlidersHorizontal,
  Store,
  Tag,
  Users,
  Workflow,
  type LucideProps,
} from "lucide-react";

// Conjunto único de ícones do site: mantém o traço e o estilo padronizados.
const icones = {
  Briefcase,
  Calculator,
  Camera,
  CircleCheck,
  ClipboardCheck,
  Eye,
  Factory,
  FileText,
  FolderOpen,
  Handshake,
  Landmark,
  LayoutList,
  ListChecks,
  MapPin,
  MessagesSquare,
  Package,
  Receipt,
  Route,
  Search,
  SlidersHorizontal,
  Store,
  Tag,
  Users,
  Workflow,
};

export type NomeIcone = keyof typeof icones;

export function Icone({ nome, ...props }: { nome: NomeIcone } & LucideProps) {
  const Componente = icones[nome];
  return <Componente aria-hidden="true" strokeWidth={1.6} {...props} />;
}
