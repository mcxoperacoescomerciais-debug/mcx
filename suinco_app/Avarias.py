"""App dedicado só ao projeto Suinco — cadastro de avaria/vencimento.

Deploy separado do painel principal (app/main.py), de propósito: aqui só
existem as páginas Avarias e Vencimentos, sem nenhum acesso aos outros
projetos/marcas do MCX Tracker. É o link que promotores e o gerente da
Suinco recebem.

Pensada para uso pelo celular: campos digitados livremente (sem seleção em
lista), layout em coluna única.

Uso:
    streamlit run suinco_app/Avarias.py
"""
from __future__ import annotations

import datetime as dt
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import streamlit as st

from core.config.settings import settings
from core.db.models import DamagedProduct
from core.db.session import get_session
from core.pipeline.expiry import AVARIA_PROJECT_KEY, AVARIA_PROJECT_LABEL, DEFAULT_WARNING_DAYS, list_active_products

st.set_page_config(page_title="Avarias — Suinco", page_icon="📦", layout="centered")

st.title("📦 Produtos em Avaria / Vencimento")
st.caption(f"{AVARIA_PROJECT_LABEL} — registre produtos avariados ou perto do vencimento")

st.subheader("Registrar novo item")
with st.form("novo_item_avaria", clear_on_submit=True):
    loja = st.text_input("Loja")
    promotor = st.text_input("Seu nome (promotor)")
    produto = st.text_input("Produto")
    tipo = st.text_input("Motivo", placeholder="Ex.: Vencimento próximo, Avariado...")
    validade = st.date_input("Data de validade (se souber)", value=None, format="DD/MM/YYYY")
    quantidade = st.number_input("Quantidade", min_value=0, step=1, value=0)
    fotos = st.file_uploader(
        "Fotos (opcional)", type=["jpg", "jpeg", "png"], accept_multiple_files=True
    )
    observacao = st.text_area("Observação (opcional)")

    submitted = st.form_submit_button("✅ Registrar", type="primary", use_container_width=True)

    if submitted:
        if not loja or not promotor or not produto:
            st.error("Preencha loja, promotor e produto.")
        else:
            foto_paths = []
            if fotos:
                avarias_dir = settings.media_dir / "avarias"
                avarias_dir.mkdir(parents=True, exist_ok=True)
                for foto in fotos:
                    ext = Path(foto.name).suffix or ".jpg"
                    foto_path = str(avarias_dir / f"{uuid.uuid4().hex}{ext}")
                    with open(foto_path, "wb") as f:
                        f.write(foto.getbuffer())
                    foto_paths.append(foto_path)

            with get_session() as session:
                session.add(
                    DamagedProduct(
                        project=AVARIA_PROJECT_KEY,
                        loja=loja,
                        promotor=promotor,
                        produto=produto,
                        quantidade=int(quantidade) or None,
                        tipo=tipo or None,
                        validade=validade,
                        observacao=observacao or None,
                        foto_paths=foto_paths,
                    )
                )
            st.success("Item registrado.")
            st.rerun()

st.divider()

st.subheader("Itens ativos")
with get_session() as session:
    items = list_active_products(session)

if not items:
    st.info("Nenhum item em avaria/vencimento registrado.")
else:
    for item in items:
        with st.container(border=True):
            st.write(f"**{item.produto}** — {item.loja}")
            st.caption(
                f"Promotor: {item.promotor} · Motivo: {item.tipo or '-'} · Qtd: {item.quantidade or '-'}"
            )
            if item.observacao:
                st.caption(item.observacao)
            if item.foto_paths:
                st.image(item.foto_paths, width=200)

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

            if st.button("✔️ Resolvido", key=f"resolve_{item.id}", use_container_width=True):
                with get_session() as session:
                    db_item = session.get(DamagedProduct, item.id)
                    db_item.status = "resolvido"
                    db_item.resolved_at = dt.datetime.now(dt.timezone.utc)
                    db_item.resolved_by = "painel"
                st.rerun()
