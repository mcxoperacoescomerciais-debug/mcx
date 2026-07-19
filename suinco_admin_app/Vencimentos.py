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

LOGO_PATH = Path(__file__).resolve().parent.parent / "assets" / "mcx_logo.png"


def render_header(subtitle: str) -> None:
    if LOGO_PATH.exists():
        # A logo já traz "MCX Operações Comerciais" escrito nela — não
        # repete o texto do wordmark ao lado, só a logo + o subtítulo.
        b64 = base64.b64encode(LOGO_PATH.read_bytes()).decode()
        logo_html = f'<img class="mcx-logo-img" src="data:image/png;base64,{b64}" />'
        st.markdown(
            f"""
            <div class="mcx-header">
                {logo_html}
                <div class="mcx-subtitle">{subtitle}</div>
            </div>
            """,
            unsafe_allow_html=True,
        )
    else:
        st.markdown(
            f"""
            <div class="mcx-header">
                <span class="mcx-logo-fallback">MCX</span>
                <div>
                    <div class="mcx-wordmark">MCX<span>OPERAÇÕES COMERCIAIS</span></div>
                    <div class="mcx-subtitle">{subtitle}</div>
                </div>
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
        padding: 1.3rem 1.4rem;
        margin-bottom: 1.5rem;
        display: flex;
        align-items: center;
        gap: 1.1rem;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
    }
    .mcx-logo-img { width: 84px; height: 84px; border-radius: 12px; object-fit: contain; }
    .mcx-logo-fallback {
        font-family: Georgia, 'Times New Roman', serif;
        font-weight: 700; font-size: 1.5rem; color: #C9A227;
        width: 52px; height: 52px; display: flex; align-items: center; justify-content: center;
        border: 1.5px solid rgba(201, 162, 39, 0.5); border-radius: 10px;
    }
    .mcx-wordmark {
        font-family: Georgia, 'Times New Roman', serif;
        font-size: 1.15rem; font-weight: 700; letter-spacing: 0.03em; color: #F2F3F7;
    }
    .mcx-wordmark span {
        display: block; font-family: sans-serif; font-size: 0.65rem; font-weight: 500;
        letter-spacing: 0.14em; color: #C9A227; margin-top: 0.2rem;
    }
    .mcx-subtitle { margin-top: 0.5rem; font-size: 0.88rem; color: rgba(242, 243, 247, 0.68); }

    div[data-testid="stVerticalBlockBorderWrapper"] {
        border-radius: 16px !important;
        box-shadow: 0 4px 18px rgba(0, 0, 0, 0.18);
        border: 1px solid rgba(201, 162, 39, 0.2) !important;
    }
    button[kind="primary"] {
        border-radius: 12px !important; font-weight: 700 !important;
        box-shadow: 0 6px 16px rgba(201, 162, 39, 0.3);
    }
    button[kind="secondary"] { border-radius: 12px !important; font-weight: 600 !important; }
    div[data-testid="stTextArea"] textarea { border-radius: 10px !important; }
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
            st.caption(
                f"Motivo: {item.tipo or '-'} · Qtd: {item.quantidade or '-'} · Registrado por: {item.promotor}"
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
                st.caption(
                    f"Promotor: {item.promotor} · Motivo: {item.tipo or '-'} · Qtd: {item.quantidade or '-'}"
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
                }
                for item in historico
            ],
            use_container_width=True,
            hide_index=True,
        )
