"""Aviso de vencimento — página pública somente-leitura para o gerente (Suinco).

Link fixo, sem login: basta abrir a URL pelo celular. Além da lista, gera uma
mensagem curta pronta pra copiar e colar no WhatsApp — em vez de mandar a
tabela inteira, que confundiria mais do que ajudaria.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

import streamlit as st

from core.db.session import get_session
from core.pipeline.expiry import AVARIA_PROJECT_LABEL, DEFAULT_WARNING_DAYS, build_whatsapp_message, list_expiring_soon

st.set_page_config(page_title="Vencimentos — Suinco", page_icon="⏰", layout="centered")

st.title(f"⏰ Vencimentos — {AVARIA_PROJECT_LABEL}")
st.caption(f"Produtos vencidos ou vencendo em até {DEFAULT_WARNING_DAYS} dias.")

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
            if item.foto_paths:
                st.image(item.foto_paths, width=200)

            label = item.validade.strftime("%d/%m/%Y") if item.validade else "-"
            if item.dias_restantes is not None and item.dias_restantes < 0:
                st.error(f"VENCIDO ({label})")
            else:
                st.warning(f"Vence em {item.dias_restantes} dia(s) ({label})")

st.divider()
st.subheader("Mensagem pronta para enviar")
st.caption("Toque no texto, selecione tudo e copie — depois é só colar na conversa do WhatsApp.")
st.text_area("Mensagem", value=build_whatsapp_message(items), height=220, label_visibility="collapsed")
