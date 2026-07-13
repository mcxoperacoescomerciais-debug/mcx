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
from core.storage.supabase_storage import upload_photo

st.set_page_config(page_title="Avarias — Suinco", page_icon="📦", layout="centered")

st.markdown(
    """
    <style>
    #MainMenu, footer { visibility: hidden; }
    .block-container { padding-top: 1.75rem; padding-bottom: 3rem; max-width: 640px; }

    .suinco-hero {
        background: linear-gradient(135deg, #E8552E 0%, #F2824F 100%);
        border-radius: 22px;
        padding: 1.5rem 1.4rem;
        margin-bottom: 1.5rem;
        display: flex;
        align-items: center;
        gap: 1rem;
        box-shadow: 0 10px 28px rgba(232, 85, 46, 0.28);
    }
    .suinco-hero .icon {
        font-size: 2rem;
        line-height: 1;
        background: rgba(255,255,255,0.22);
        border-radius: 16px;
        padding: 0.5rem 0.65rem;
    }
    .suinco-hero h1 { font-size: 1.35rem; margin: 0; color: #FFFFFF; font-weight: 800; }
    .suinco-hero p { margin: 0.15rem 0 0; color: rgba(255,255,255,0.92); font-size: 0.9rem; }

    div[data-testid="stForm"] {
        background: #FFFFFF;
        border-radius: 20px;
        padding: 1.75rem 1.5rem 1.35rem;
        border: 1px solid #F1E3D8;
        box-shadow: 0 6px 24px rgba(43, 34, 29, 0.07);
    }
    div[data-testid="stTextInput"] input,
    div[data-testid="stNumberInput"] input,
    div[data-testid="stDateInput"] input,
    div[data-testid="stTextArea"] textarea,
    div[data-testid="stSelectbox"] div[data-baseweb="select"] {
        border-radius: 12px !important;
    }
    button[kind="primary"] {
        border-radius: 14px !important;
        font-weight: 700 !important;
        padding-top: 0.75rem !important;
        padding-bottom: 0.75rem !important;
        box-shadow: 0 6px 16px rgba(232, 85, 46, 0.35);
    }
    button[kind="secondary"] { border-radius: 14px !important; font-weight: 600 !important; }
    .suinco-chip {
        display: inline-flex; align-items: center; gap: 0.4rem;
        background: #FBEDE4; color: #2B221D; border-radius: 999px;
        padding: 0.35rem 0.9rem; font-size: 0.88rem; font-weight: 600;
    }
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
        '<div class="suinco-hero"><span class="icon">📦</span>'
        f'<div><h1>{AVARIA_PROJECT_LABEL}</h1>'
        '<p>Identifique-se para continuar</p></div></div>',
        unsafe_allow_html=True,
    )
    with st.form("login_promotor"):
        nome_login = st.selectbox("Seu nome", options=sorted(promoter_pins.keys()))
        pin_login = st.text_input("PIN (4 dígitos)", type="password", max_chars=4)
        entrar = st.form_submit_button("Entrar 👋", type="primary", use_container_width=True)
    if entrar:
        if promoter_pins.get(nome_login) == pin_login:
            st.session_state.promotor_atual = nome_login
            st.rerun()
        else:
            st.error("PIN incorreto.")
    st.stop()

promotor_fixo = st.session_state.promotor_atual

st.markdown(
    '<div class="suinco-hero"><span class="icon">📦</span>'
    f'<div><h1>{AVARIA_PROJECT_LABEL}</h1>'
    '<p>Registre um produto avariado ou perto do vencimento</p></div></div>',
    unsafe_allow_html=True,
)

if promotor_fixo:
    top_left, top_right = st.columns([3, 1])
    with top_left:
        st.markdown(f'<span class="suinco-chip">👤 {promotor_fixo}</span>', unsafe_allow_html=True)
    with top_right:
        if st.button("Trocar", use_container_width=True):
            st.session_state.promotor_atual = None
            st.rerun()
    st.write("")

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

    submitted = st.form_submit_button("📤 Registrar item", type="primary", use_container_width=True)

    if submitted:
        if not loja or not promotor or not produto:
            st.error("Preencha loja, promotor e produto.")
        else:
            foto_paths = []
            if fotos:
                for foto in fotos:
                    file_bytes = foto.getbuffer().tobytes()
                    url = upload_photo(file_bytes, foto.name)
                    if url:
                        foto_paths.append(url)
                    else:
                        # Sem Supabase Storage configurado (ex.: local sem
                        # secrets) — cai de volta pro disco local, sabendo
                        # que ele não é permanente no Streamlit Cloud.
                        avarias_dir = settings.media_dir / "avarias"
                        avarias_dir.mkdir(parents=True, exist_ok=True)
                        ext = Path(foto.name).suffix or ".jpg"
                        foto_path = str(avarias_dir / f"{uuid.uuid4().hex}{ext}")
                        with open(foto_path, "wb") as f:
                            f.write(file_bytes)
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
            st.success("🎉 Item registrado com sucesso! Obrigado.")
            st.balloons()
