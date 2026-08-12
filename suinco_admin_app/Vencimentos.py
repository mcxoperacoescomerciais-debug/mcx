"""App de gestão do projeto Suinco — vencimentos, resolução e histórico.

Deploy separado tanto do painel principal (app/main.py) quanto do app dos
promotores (suinco_app/Avarias.py). Existem dois níveis de acesso na MESMA
URL, diferenciados por um parâmetro secreto na URL:

- Sem `?chave=...` (ou com a chave errada): visão do GERENTE — só leitura,
  mostra o que está vencendo e a mensagem pronta pra WhatsApp. Esse é o link
  que se manda pro gerente da marca.
- Com `?chave=<ADMIN_KEY>` (definida em st.secrets["ADMIN_KEY"]): visão
  completa (Eduardo) — soma a lista de todos os itens ativos com o botão
  "Resolvido" e o histórico de itens já resolvidos.

Os promotores nunca recebem nenhum dos dois links — o app deles
(suinco_app) não tem essa página.

Visual: identidade MCX (azul-marinho + dourado, ver assets/mcx_logo.png).
"""
from __future__ import annotations

import base64
import datetime as dt
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import streamlit as st

from core.db.models import DamagedProduct
from core.db.session import get_session
from core.pipeline.expiry import (
    AVARIA_PROJECT_LABEL,
    DEFAULT_WARNING_DAYS,
    build_whatsapp_message,
    list_active_products,
    list_expiring_soon,
    list_history,
)
from core.storage.supabase_storage import delete_photo

st.set_page_config(page_title="Vencimentos — Suinco | MCX", page_icon="🗂️", layout="centered")

ASSETS_DIR = Path(__file__).resolve().parent.parent / "assets"
MCX_LOGO_PATH = ASSETS_DIR / "mcx_logo.png"
AF_LOGO_PATH = ASSETS_DIR / "af_logo.png"


def _img_data_uri(path: Path) -> str | None:
    if not path.exists():
        return None
    return f"data:image/png;base64,{base64.b64encode(path.read_bytes()).decode()}"


def render_header(subtitle: str) -> None:
    af_uri = _img_data_uri(AF_LOGO_PATH)
    mcx_uri = _img_data_uri(MCX_LOGO_PATH)
    parts = []
    if af_uri:
        parts.append(f'<img class="af-logo-img-sm" src="{af_uri}" />')
    if af_uri and mcx_uri:
        parts.append('<span class="mcx-mini-divider"></span>')
    if mcx_uri:
        parts.append(f'<img class="mcx-logo-img-sm" src="{mcx_uri}" />')
    logos = "".join(parts) if parts else '<span class="mcx-logo-fallback">AF · MCX</span>'

    st.markdown(
        f"""
        <div class="mcx-header">
            <div class="mcx-header-logos">{logos}</div>
            <div class="mcx-subtitle">{subtitle}</div>
        </div>
        """,
        unsafe_allow_html=True,
    )


def _existing_photos(paths: list[str]) -> list[str]:
    """Filtra fotos exibíveis: URLs (Supabase Storage) sempre passam — quem
    resolve se carregam é o navegador, não trava a página; caminhos locais
    só passam se o arquivo ainda existir em disco.

    O disco do Streamlit Cloud não é permanente — fotos enviadas antes do
    Supabase Storage entrar em uso podem ter caminho local salvo no banco
    mas o arquivo já sumiu. Sem esse filtro, st.image() derruba a página
    inteira com MediaFileStorageError.
    """
    ok = []
    for p in paths or []:
        if not p:
            continue
        if p.startswith("http://") or p.startswith("https://"):
            ok.append(p)
        elif os.path.exists(p):
            ok.append(p)
    return ok


def _resolve_item(item_id: int, foto_paths: list[str]) -> None:
    """Marca o item como resolvido e apaga as fotos associadas — resolvido
    significa que o produto já saiu da prateleira, não faz sentido manter
    a foto ocupando espaço no Storage depois disso."""
    for path in foto_paths or []:
        if path and (path.startswith("http://") or path.startswith("https://")):
            delete_photo(path)
        elif path and os.path.exists(path):
            os.remove(path)

    with get_session() as session:
        db_item = session.get(DamagedProduct, item_id)
        db_item.status = "resolvido"
        db_item.resolved_at = dt.datetime.now(dt.timezone.utc)
        db_item.resolved_by = "Eduardo"
        db_item.foto_paths = []


st.markdown(
    """
    <style>
    #MainMenu, footer { visibility: hidden; }
    .block-container { padding-top: 1.75rem; padding-bottom: 3rem; max-width: 700px; }

    .mcx-header {
        background: linear-gradient(135deg, #0B1130 0%, #1B2456 100%);
        border: 1px solid rgba(201, 162, 39, 0.35);
        border-radius: 18px;
        padding: 1.2rem 1.4rem;
        margin-bottom: 1.5rem;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
    }
    .mcx-header-logos { display: flex; align-items: center; gap: 0.8rem; margin-bottom: 0.6rem; }
    .af-logo-img-sm { width: 44px; height: 44px; object-fit: contain; }
    .mcx-logo-img-sm { width: 40px; height: 40px; border-radius: 8px; object-fit: contain; }
    .mcx-mini-divider { width: 1px; height: 30px; background: rgba(201, 162, 39, 0.4); }
    .mcx-logo-fallback {
        font-family: Georgia, 'Times New Roman', serif;
        font-weight: 700; font-size: 1.1rem; color: #C9A227; letter-spacing: 0.04em;
    }
    .mcx-subtitle { font-size: 0.88rem; color: rgba(242, 243, 247, 0.68); }

    div[data-testid="stVerticalBlockBorderWrapper"] {
        background: #232B5C !important;
        border-radius: 16px !important;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
        border: 1.5px solid rgba(201, 162, 39, 0.4) !important;
    }
    button[kind="primary"] {
        border-radius: 12px !important; font-weight: 700 !important;
        box-shadow: 0 6px 16px rgba(201, 162, 39, 0.3);
    }
    button[kind="secondary"] { border-radius: 12px !important; font-weight: 600 !important; }
    div[data-testid="stTextArea"] textarea {
        border-radius: 10px !important;
        background-color: #0F1638 !important;
        border: 1px solid rgba(201, 162, 39, 0.3) !important;
    }
    .mcx-badge {
        display: inline-flex; align-items: center; gap: 0.35rem;
        background: rgba(201, 162, 39, 0.14); color: #F2F3F7; border-radius: 999px;
        padding: 0.3rem 0.85rem; font-size: 0.83rem; font-weight: 700;
        border: 1px solid rgba(201, 162, 39, 0.3);
        margin-bottom: 0.75rem;
    }
    </style>
    """,
    unsafe_allow_html=True,
)

try:
    ADMIN_KEY = st.secrets.get("ADMIN_KEY", "")
except Exception:
    ADMIN_KEY = ""
is_admin = bool(ADMIN_KEY) and st.query_params.get("chave") == ADMIN_KEY

render_header(
    f"{AVARIA_PROJECT_LABEL} — Controle de Vencimentos "
    f"(produtos vencidos ou vencendo em até {DEFAULT_WARNING_DAYS} dias)"
)
if is_admin:
    st.markdown('<span class="mcx-badge">Acesso Administrativo</span>', unsafe_allow_html=True)

with get_session() as session:
    items = list_expiring_soon(session)

if not items:
    st.success("Nenhum produto vencendo nos próximos dias.")
else:
    for item in items:
        with st.container(border=True):
            st.write(f"**{item.produto}** — {item.loja}")
            preco_str = f" · Preço: R$ {item.preco:.2f}".replace(".", ",") if item.preco is not None else ""
            st.caption(
                f"Motivo: {item.tipo or '-'} · Qtd: {item.quantidade or '-'} · "
                f"Registrado por: {item.promotor}{preco_str}"
            )
            if item.observacao:
                st.caption(item.observacao)
            fotos_ok = _existing_photos(item.foto_paths)
            if fotos_ok:
                st.image(fotos_ok, width=200)

            label = item.validade.strftime("%d/%m/%Y") if item.validade else "-"
            if item.dias_restantes is not None and item.dias_restantes < 0:
                st.error(f"VENCIDO ({label})")
            else:
                st.warning(f"Vence em {item.dias_restantes} dia(s) ({label})")

            if is_admin:
                if st.button("Marcar como Resolvido", key=f"resolve_top_{item.id}", use_container_width=True):
                    _resolve_item(item.id, item.foto_paths)
                    st.rerun()

st.divider()
st.subheader("Mensagem para Envio")
st.caption("Selecione o texto abaixo e copie para encaminhar via WhatsApp.")
st.text_area("Mensagem", value=build_whatsapp_message(items), height=220, label_visibility="collapsed")

if not is_admin:
    st.stop()

# --- A partir daqui, só quem acessa com a chave de administrador -----------
st.divider()
st.header("Painel de Gestão")

tab_ativos, tab_historico = st.tabs(["Itens Ativos", "Histórico"])

with tab_ativos:
    with get_session() as session:
        ativos = list_active_products(session)

    if not ativos:
        st.info("Nenhum item ativo no momento.")
    else:
        for item in ativos:
            with st.container(border=True):
                st.write(f"**{item.produto}** — {item.loja}")
                preco_str = f" · Preço: R$ {item.preco:.2f}".replace(".", ",") if item.preco is not None else ""
                st.caption(
                    f"Promotor: {item.promotor} · Motivo: {item.tipo or '-'} · "
                    f"Qtd: {item.quantidade or '-'}{preco_str}"
                )
                if item.observacao:
                    st.caption(item.observacao)
                fotos_ok = _existing_photos(item.foto_paths)
                if fotos_ok:
                    st.image(fotos_ok, width=160)
                if item.validade:
                    label = f"Validade: {item.validade.strftime('%d/%m/%Y')}"
                    if item.dias_restantes is not None and item.dias_restantes < 0:
                        st.error(f"{label} — VENCIDO há {abs(item.dias_restantes)} dia(s)")
                    elif item.dias_restantes is not None and item.dias_restantes <= DEFAULT_WARNING_DAYS:
                        st.warning(f"{label} — vence em {item.dias_restantes} dia(s)")
                    else:
                        st.write(f"{label} — {item.dias_restantes} dia(s) restantes")
                else:
                    st.write("Sem validade informada")

                if st.button("Marcar como Resolvido", key=f"resolve_{item.id}", use_container_width=True):
                    _resolve_item(item.id, item.foto_paths)
                    st.rerun()

with tab_historico:
    with get_session() as session:
        historico = list_history(session)

    if not historico:
        st.info("Nenhum item resolvido ainda.")
    else:
        st.dataframe(
            [
                {
                    "Resolvido em": item.resolved_at.strftime("%d/%m/%Y %H:%M") if item.resolved_at else "-",
                    "Produto": item.produto,
                    "Loja": item.loja,
                    "Promotor": item.promotor,
                    "Motivo": item.tipo or "-",
                    "Qtd": item.quantidade or "-",
                    "Validade": item.validade.strftime("%d/%m/%Y") if item.validade else "-",
                    "Preço": f"R$ {item.preco:.2f}".replace(".", ",") if item.preco is not None else "-",
                }
                for item in historico
            ],
            use_container_width=True,
            hide_index=True,
        )
