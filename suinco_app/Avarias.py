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

ASSETS_DIR = Path(__file__).resolve().parent.parent / "assets"
MCX_LOGO_PATH = ASSETS_DIR / "mcx_logo.png"
AF_LOGO_PATH = ASSETS_DIR / "af_logo.png"

TAGLINE = "Excelência em Trade Marketing e Merchandising"


def _img_data_uri(path: Path) -> str | None:
    if not path.exists():
        return None
    return f"data:image/png;base64,{base64.b64encode(path.read_bytes()).decode()}"


def _logos_html(af_class: str, mcx_class: str, divider_class: str) -> str:
    af_uri = _img_data_uri(AF_LOGO_PATH)
    mcx_uri = _img_data_uri(MCX_LOGO_PATH)
    parts = []
    if af_uri:
        parts.append(f'<img class="{af_class}" src="{af_uri}" />')
    if af_uri and mcx_uri:
        parts.append(f'<span class="{divider_class}"></span>')
    if mcx_uri:
        parts.append(f'<img class="{mcx_class}" src="{mcx_uri}" />')
    if not parts:
        parts.append('<span class="mcx-logo-fallback">AF · MCX</span>')
    return "".join(parts)


def render_login_hero() -> None:
    """Tela de abertura do login: as duas marcas em destaque + frase de
    efeito — a primeira coisa que o promotor vê, por isso mais elaborada
    que o cabeçalho compacto usado no resto do app."""
    logos = _logos_html("af-logo-img", "mcx-logo-img-hero", "mcx-hero-divider")
    st.markdown(
        f"""
        <div class="mcx-hero-login">
            <div class="mcx-hero-logos">{logos}</div>
            <div class="mcx-tagline">{TAGLINE}</div>
            <div class="mcx-hero-rule"></div>
            <div class="mcx-hero-subtitle">{AVARIA_PROJECT_LABEL} · Autenticação do Promotor</div>
        </div>
        """,
        unsafe_allow_html=True,
    )


def render_header(subtitle: str) -> None:
    logos = _logos_html("af-logo-img-sm", "mcx-logo-img-sm", "mcx-mini-divider")
    st.markdown(
        f"""
        <div class="mcx-header">
            <div class="mcx-header-logos">{logos}</div>
            <div class="mcx-subtitle">{subtitle}</div>
        </div>
        """,
        unsafe_allow_html=True,
    )


st.markdown(
    """
    <style>
    #MainMenu, footer { visibility: hidden; }
    .block-container { padding-top: 1.75rem; padding-bottom: 3rem; max-width: 640px; }

    /* Tela de abertura do login — mais elaborada, com as duas marcas e frase de efeito */
    .mcx-hero-login {
        text-align: center;
        padding: 2.4rem 1.6rem 2rem;
        background: radial-gradient(ellipse at top, #1E2A63 0%, #0B1130 72%);
        border: 1px solid rgba(201, 162, 39, 0.4);
        border-radius: 24px;
        margin-bottom: 1.75rem;
        box-shadow: 0 16px 44px rgba(0, 0, 0, 0.45);
    }
    .mcx-hero-logos { display: flex; align-items: center; justify-content: center; gap: 1.2rem; margin-bottom: 1.1rem; }
    .af-logo-img { width: 96px; height: 96px; object-fit: contain; filter: drop-shadow(0 6px 16px rgba(0,0,0,0.4)); }
    .mcx-logo-img-hero { width: 66px; height: 66px; border-radius: 12px; object-fit: contain; }
    .mcx-hero-divider { width: 1px; height: 64px; background: linear-gradient(180deg, transparent, rgba(201,162,39,0.55), transparent); }
    .mcx-tagline {
        font-family: Georgia, 'Times New Roman', serif; font-style: italic;
        font-size: 1.05rem; color: #D9B84A; letter-spacing: 0.01em; margin-bottom: 1.2rem;
    }
    .mcx-hero-rule { width: 64px; height: 2px; background: linear-gradient(90deg, transparent, #C9A227, transparent); margin: 0 auto 1.1rem; }
    .mcx-hero-subtitle {
        font-size: 0.82rem; color: rgba(242, 243, 247, 0.78); text-transform: uppercase;
        letter-spacing: 0.1em; font-weight: 600;
    }

    /* Cabeçalho compacto — usado nas demais telas do app */
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
    render_login_hero()
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
