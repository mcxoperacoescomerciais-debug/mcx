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

Visual: identidade MCX (azul-marinho + dourado, ver assets/mcx_logo.png).
Sem o arquivo da logo, cai num selo "MCX" estilizado em texto no lugar da
imagem — não quebra se a logo ainda não tiver sido adicionada.

Pensada para uso pelo celular: campos digitados livremente (sem seleção em
lista), layout em coluna única.

Uso:
    streamlit run suinco_app/Avarias.py
"""
from __future__ import annotations

import base64
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import streamlit as st

from core.config.settings import settings
from core.db.models import DamagedProduct
from core.db.session import get_session
from core.pipeline.expiry import AVARIA_PROJECT_KEY, AVARIA_PROJECT_LABEL
from core.sheets.suinco_sync import append_avaria_row
from core.storage.supabase_storage import upload_photo

st.set_page_config(page_title="Avarias — Suinco | MCX", page_icon="🗂️", layout="centered")

MOTIVO_VENCIMENTO = "VENCIMENTO"
MOTIVO_AVARIA = "PACOTE COM AVARIA"
MOTIVO_OPTIONS = [MOTIVO_VENCIMENTO, MOTIVO_AVARIA]

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


st.markdown(
    """
    <style>
    #MainMenu, footer { visibility: hidden; }
    .block-container { padding-top: 1.75rem; padding-bottom: 3rem; max-width: 640px; }

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

    div[data-testid="stForm"] {
        background: #232B5C;
        border-radius: 18px;
        padding: 1.75rem 1.5rem 1.35rem;
        border: 1.5px solid rgba(201, 162, 39, 0.5);
        box-shadow: 0 8px 28px rgba(0, 0, 0, 0.4);
    }
    div[data-testid="stTextInput"] input,
    div[data-testid="stNumberInput"] input,
    div[data-testid="stDateInput"] input,
    div[data-testid="stTextArea"] textarea,
    div[data-testid="stSelectbox"] div[data-baseweb="select"] {
        border-radius: 10px !important;
        background-color: #0F1638 !important;
        border: 1px solid rgba(201, 162, 39, 0.3) !important;
    }
    button[kind="primary"] {
        border-radius: 12px !important;
        font-weight: 700 !important;
        padding-top: 0.75rem !important;
        padding-bottom: 0.75rem !important;
        box-shadow: 0 6px 16px rgba(201, 162, 39, 0.3);
    }
    button[kind="secondary"] { border-radius: 12px !important; font-weight: 600 !important; }
    .mcx-chip {
        display: inline-flex; align-items: center; gap: 0.4rem;
        background: rgba(201, 162, 39, 0.14); color: #F2F3F7; border-radius: 999px;
        padding: 0.35rem 0.9rem; font-size: 0.86rem; font-weight: 600;
        border: 1px solid rgba(201, 162, 39, 0.3);
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
    render_header(f"{AVARIA_PROJECT_LABEL} — Autenticação do Promotor")
    with st.form("login_promotor"):
        nome_login = st.selectbox("Nome do promotor", options=sorted(promoter_pins.keys()))
        pin_login = st.text_input("Código de acesso (PIN)", type="password", max_chars=4)
        entrar = st.form_submit_button("Acessar", type="primary", use_container_width=True)
    if entrar:
        if promoter_pins.get(nome_login) == pin_login:
            st.session_state.promotor_atual = nome_login
            st.rerun()
        else:
            st.error("Código de acesso incorreto.")
    st.stop()

promotor_fixo = st.session_state.promotor_atual

render_header(f"{AVARIA_PROJECT_LABEL} — Registro de Avarias e Vencimentos")

if promotor_fixo:
    top_left, top_right = st.columns([3, 1])
    with top_left:
        st.markdown(f'<span class="mcx-chip">Promotor: {promotor_fixo}</span>', unsafe_allow_html=True)
    with top_right:
        if st.button("Sair", use_container_width=True):
            st.session_state.promotor_atual = None
            st.rerun()
    st.write("")

# Fora do form: precisa de rerun imediato ao trocar, pra decidir se mostra
# o campo de validade (só faz sentido pra VENCIMENTO, não pra avaria).
tipo = st.radio("Tipo de Ocorrência", options=MOTIVO_OPTIONS, horizontal=True)

with st.form("novo_item_avaria", clear_on_submit=True):
    loja = st.text_input("Loja")
    if promotor_fixo:
        promotor = promotor_fixo
    else:
        promotor = st.text_input("Nome do promotor")
    produto = st.text_input("Produto")
    if tipo == MOTIVO_VENCIMENTO:
        validade = st.date_input("Data de Validade", value=None, format="DD/MM/YYYY")
    else:
        validade = None
    quantidade = st.number_input("Quantidade", min_value=0, step=1, value=0)
    fotos = st.file_uploader(
        "Evidência Fotográfica (opcional)", type=["jpg", "jpeg", "png"], accept_multiple_files=True
    )
    observacao = st.text_area("Observação (opcional)")

    submitted = st.form_submit_button("Registrar Ocorrência", type="primary", use_container_width=True)

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
                        print(
                            "[avarias] upload_photo devolveu None — Supabase Storage não "
                            "configurado (SUPABASE_URL/SUPABASE_SERVICE_KEY). Foto vai pro "
                            "disco local (não sobrevive a reinícios do app).",
                            file=sys.stderr,
                        )
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

            # A planilha é só um espelho pros gestores acompanharem — o
            # banco acima é a fonte de verdade. Se isso falhar (planilha
            # não configurada, sem internet, etc.), o cadastro já foi
            # salvo mesmo assim.
            append_avaria_row(
                loja=loja,
                promotor=promotor,
                produto=produto,
                tipo=tipo,
                validade=validade,
                quantidade=int(quantidade) or None,
                observacao=observacao,
                foto_paths=foto_paths,
            )

            st.success("Registro concluído com sucesso.")
