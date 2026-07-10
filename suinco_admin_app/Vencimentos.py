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
"""
from __future__ import annotations

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

st.set_page_config(page_title="Vencimentos — Suinco", page_icon="⏰", layout="centered")


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

st.markdown(
    """
    <style>
    .block-container { padding-top: 2.5rem; padding-bottom: 3rem; max-width: 700px; }
    div[data-testid="stVerticalBlockBorderWrapper"] {
        border-radius: 14px !important;
    }
    button[kind="primary"] { border-radius: 10px !important; font-weight: 600 !important; }
    .suinco-header { display:flex; align-items:center; gap:0.7rem; margin-bottom:0.1rem; }
    .suinco-header .icon {
        font-size: 2.1rem; line-height:1; background: rgba(16,185,129,0.15);
        border-radius: 14px; padding: 0.5rem 0.6rem;
    }
    .suinco-header h1 { font-size: 1.5rem; margin: 0; }
    .suinco-subtitle { color: rgba(255,255,255,0.55); margin-bottom: 1.5rem; font-size: 0.95rem; }
    </style>
    """,
    unsafe_allow_html=True,
)

try:
    ADMIN_KEY = st.secrets.get("ADMIN_KEY", "")
except Exception:
    ADMIN_KEY = ""
is_admin = bool(ADMIN_KEY) and st.query_params.get("chave") == ADMIN_KEY

st.markdown(
    '<div class="suinco-header"><span class="icon">⏰</span>'
    f'<h1>Vencimentos — {AVARIA_PROJECT_LABEL}</h1></div>'
    f'<div class="suinco-subtitle">Produtos vencidos ou vencendo em até {DEFAULT_WARNING_DAYS} dias.</div>',
    unsafe_allow_html=True,
)

with get_session() as session:
    items = list_expiring_soon(session)

if not items:
    st.success("Nenhum produto vencendo nos próximos dias. 🎉")
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

st.divider()
st.subheader("Mensagem pronta para enviar")
st.caption("Toque no texto, selecione tudo e copie — depois é só colar na conversa do WhatsApp.")
st.text_area("Mensagem", value=build_whatsapp_message(items), height=220, label_visibility="collapsed")

if not is_admin:
    st.stop()

# --- A partir daqui, só quem acessa com a chave de administrador -----------
st.divider()
st.header("🔧 Gestão (uso interno)")

tab_ativos, tab_historico = st.tabs(["📋 Todos os itens ativos", "🕘 Histórico"])

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

                if st.button("✔️ Marcar como resolvido", key=f"resolve_{item.id}", use_container_width=True):
                    with get_session() as session:
                        db_item = session.get(DamagedProduct, item.id)
                        db_item.status = "resolvido"
                        db_item.resolved_at = dt.datetime.now(dt.timezone.utc)
                        db_item.resolved_by = "Eduardo"
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
