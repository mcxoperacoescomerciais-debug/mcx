"""App dedicado só ao projeto Suinco — cadastro de avaria/vencimento.

Deploy separado do painel principal (app/main.py) e do painel de gestão
(suinco_admin_app/Vencimentos.py), de propósito: aqui só existe a tela de
cadastro. Sem lista de itens, sem opção de "Resolvido", sem aba de
Vencimentos — só o essencial pro promotor preencher e enviar. É o único
link que os 10 promotores recebem.

Se houver PINs configurados em st.secrets["promoter_pins"] (um por
promotor), pede identificação antes do formulário. Sem isso configurado,
cai de volta no campo de nome digitado livremente (não quebra em ambiente
local sem secrets).

Pensada para uso pelo celular: campos digitados livremente (sem seleção em
lista), layout em coluna única.

Uso:
    streamlit run suinco_app/Avarias.py
"""
from __future__ import annotations

import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import streamlit as st

from core.config.settings import settings
from core.db.models import DamagedProduct
from core.db.session import get_session
from core.pipeline.expiry import AVARIA_PROJECT_KEY, AVARIA_PROJECT_LABEL

st.set_page_config(page_title="Avarias — Suinco", page_icon="📦", layout="centered")

st.markdown(
    """
    <style>
    .block-container { padding-top: 2.5rem; padding-bottom: 3rem; max-width: 640px; }
    div[data-testid="stForm"] {
        background: rgba(255,255,255,0.03);
        border-radius: 18px;
        padding: 1.75rem 1.5rem 1.25rem;
        border: 1px solid rgba(255,255,255,0.09);
    }
    div[data-testid="stTextInput"] input,
    div[data-testid="stNumberInput"] input,
    div[data-testid="stDateInput"] input,
    div[data-testid="stTextArea"] textarea {
        border-radius: 10px !important;
    }
    button[kind="primary"] {
        border-radius: 10px !important;
        font-weight: 600 !important;
        padding-top: 0.65rem !important;
        padding-bottom: 0.65rem !important;
    }
    .suinco-header { display:flex; align-items:center; gap:0.7rem; margin-bottom:0.1rem; }
    .suinco-header .icon {
        font-size: 2.1rem; line-height:1; background: rgba(16,185,129,0.15);
        border-radius: 14px; padding: 0.5rem 0.6rem;
    }
    .suinco-header h1 { font-size: 1.5rem; margin: 0; }
    .suinco-subtitle { color: rgba(255,255,255,0.55); margin-bottom: 1.75rem; font-size: 0.95rem; }
    </style>
    """,
    unsafe_allow_html=True,
)

try:
    promoter_pins = dict(st.secrets.get("promoter_pins", {}))
except Exception:
    promoter_pins = {}

if "promotor_atual" not in st.session_state:
    st.session_state.promotor_atual = None

if promoter_pins and not st.session_state.promotor_atual:
    st.markdown(
        '<div class="suinco-header"><span class="icon">📦</span>'
        f'<h1>{AVARIA_PROJECT_LABEL}</h1></div>'
        '<div class="suinco-subtitle">Identifique-se para continuar</div>',
        unsafe_allow_html=True,
    )
    with st.form("login_promotor"):
        nome_login = st.selectbox("Seu nome", options=sorted(promoter_pins.keys()))
        pin_login = st.text_input("PIN (4 dígitos)", type="password", max_chars=4)
        entrar = st.form_submit_button("Entrar", type="primary", use_container_width=True)
    if entrar:
        if promoter_pins.get(nome_login) == pin_login:
            st.session_state.promotor_atual = nome_login
            st.rerun()
        else:
            st.error("PIN incorreto.")
    st.stop()

promotor_fixo = st.session_state.promotor_atual

st.markdown(
    '<div class="suinco-header"><span class="icon">📦</span>'
    f'<h1>{AVARIA_PROJECT_LABEL}</h1></div>'
    '<div class="suinco-subtitle">Registre um produto avariado ou perto do vencimento</div>',
    unsafe_allow_html=True,
)

if promotor_fixo:
    top_left, top_right = st.columns([3, 1])
    with top_left:
        st.caption(f"Conectado como **{promotor_fixo}**")
    with top_right:
        if st.button("Trocar", use_container_width=True):
            st.session_state.promotor_atual = None
            st.rerun()

with st.form("novo_item_avaria", clear_on_submit=True):
    loja = st.text_input("Loja")
    if promotor_fixo:
        promotor = promotor_fixo
    else:
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
            st.success("Item registrado com sucesso.")
