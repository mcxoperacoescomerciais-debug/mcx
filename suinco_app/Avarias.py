"""App dedicado só ao projeto Suinco — cadastro de avaria/vencimento.

Deploy separado do painel principal (app/main.py) e do painel de gestão
(suinco_admin_app/Vencimentos.py), de propósito: aqui só existe a tela de
cadastro. Sem lista de itens, sem opção de "Resolvido", sem aba de
Vencimentos — só o essencial pro promotor preencher e enviar. É o único
link que os 10 promotores recebem.

Se houver credenciais configuradas em st.secrets["promoter_pins"] (nome
completo -> senha), pede login (nome + senha digitados, sem lista de
seleção — uma lista suspensa exporia o nome de todos os promotores pra
qualquer um) antes do formulário. Sem isso configurado, cai de volta no
campo de nome digitado livremente (não quebra em ambiente local sem
secrets).

Visual: identidade MCX + Adriana Fontes (azul-marinho + dourado, ver
assets/mcx_logo.png e assets/af_logo.png). Sem os arquivos de logo, cai
num selo em texto no lugar da imagem — não quebra se ainda não tiverem
sido adicionados.

Pensada para uso pelo celular: campos digitados livremente (sem seleção em
lista), layout em coluna única.

Uso:
    streamlit run suinco_app/Avarias.py
"""
from __future__ import annotations

import base64
import subprocess
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import streamlit as st
import streamlit.components.v1 as components

from core.config.settings import settings
from core.db.models import DamagedProduct
from core.db.session import get_session
from core.pipeline.expiry import AVARIA_PROJECT_KEY, AVARIA_PROJECT_LABEL
from core.sheets.suinco_sync import append_avaria_row
from core.storage.supabase_storage import upload_photo

st.set_page_config(page_title="Avarias — Suinco | MCX", page_icon="🗂️", layout="centered")

STATIC_DIR = Path(__file__).resolve().parent / "static"


def _current_app_version() -> str:
    """Identifica a versão em execução agora (hash curto do commit) — sem
    precisar lembrar de atualizar nenhum número manualmente a cada deploy.
    Cai pra um valor com timestamp se não achar o git (ex.: rodando sem
    histórico do repositório)."""
    try:
        result = subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"],
            cwd=Path(__file__).resolve().parent.parent,
            capture_output=True,
            text=True,
            timeout=3,
        )
        if result.returncode == 0 and result.stdout.strip():
            return result.stdout.strip()
    except Exception:
        pass
    import datetime as _dt

    return _dt.datetime.now().strftime("dev-%Y%m%d%H%M%S")


def _write_version_file(version: str) -> None:
    """Reescreve /app/static/version.txt com a versão em execução agora —
    é nisso que o promotor já logado compara pra saber se surgiu um deploy
    novo (ver `_show_update_gate`)."""
    try:
        STATIC_DIR.mkdir(parents=True, exist_ok=True)
        (STATIC_DIR / "version.txt").write_text(version, encoding="utf-8")
    except Exception:
        pass


def _register_pwa_manifest() -> None:
    """Deixa o app instalável na tela inicial (ícone, tela cheia) — feito
    via JS porque o Streamlit não deixa a gente editar o <head> da página
    diretamente. Roda sempre, mesmo antes do login, pra funcionar já na
    tela de autenticação. O componente roda num iframe same-origin, então
    alcança `window.parent.document` (a página real)."""
    html = """
    <script>
    (function() {
        var doc = window.parent.document;

        function ensureHead(tag, attrs) {
            var selector = tag + Object.keys(attrs).map(function(k) {
                return '[' + k + '="' + attrs[k] + '"]';
            }).join('');
            if (doc.head.querySelector(selector)) return;
            var el = doc.createElement(tag);
            Object.keys(attrs).forEach(function(k) { el.setAttribute(k, attrs[k]); });
            doc.head.appendChild(el);
        }

        ensureHead('link', { rel: 'manifest', href: '/app/static/manifest.json' });
        ensureHead('meta', { name: 'theme-color', content: '#0B1130' });
        ensureHead('link', { rel: 'apple-touch-icon', href: '/app/static/apple-touch-icon.png' });
        ensureHead('meta', { name: 'apple-mobile-web-app-capable', content: 'yes' });
        ensureHead('meta', { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' });

        if ('serviceWorker' in navigator && !window.__mcxSwRegistered) {
            window.__mcxSwRegistered = true;
            navigator.serviceWorker.register('/app/static/sw.js').catch(function() {});
        }
    })();
    </script>
    """
    components.html(html, height=0, width=0)


def _show_update_gate(version: str) -> None:
    """Bloqueia o app com um pop-up (sem botão de fechar) quando detecta
    que já existe uma versão mais nova publicada — só chamado DEPOIS do
    login, pra não incomodar quem ainda nem entrou. Compara com
    /app/static/version.txt (reescrito a cada novo deploy) a cada ~45s;
    o único jeito de sair do pop-up é clicando "Atualizar agora", que
    recarrega a página."""
    html = f"""
    <script>
    (function() {{
        var doc = window.parent.document;
        var CURRENT_VERSION = {version!r};

        if (!doc.getElementById('mcx-update-gate')) {{
            var overlay = doc.createElement('div');
            overlay.id = 'mcx-update-gate';
            overlay.style.cssText = 'position:fixed;inset:0;z-index:999999;'
                + 'background:rgba(6,10,32,0.92);display:none;align-items:center;'
                + 'justify-content:center;padding:1.5rem;font-family:sans-serif;';
            overlay.innerHTML = '<div style="background:#161D42;border:1.5px solid #C9A227;'
                + 'border-radius:18px;padding:2rem 1.75rem;max-width:360px;text-align:center;'
                + 'box-shadow:0 20px 50px rgba(0,0,0,0.5);">'
                + '<div style="font-size:1.05rem;font-weight:700;color:#F2F3F7;margin-bottom:0.6rem;">'
                + 'Nova atualização disponível</div>'
                + '<div style="font-size:0.9rem;color:rgba(242,243,247,0.8);margin-bottom:1.4rem;">'
                + 'Atualize o app para continuar usando.</div>'
                + '<button id="mcx-update-gate-btn" style="background:#C9A227;color:#0B1130;'
                + 'border:none;border-radius:10px;padding:0.7rem 1.6rem;font-weight:700;'
                + 'font-size:0.95rem;cursor:pointer;">Atualizar agora</button></div>';
            doc.body.appendChild(overlay);
            doc.getElementById('mcx-update-gate-btn').addEventListener('click', function() {{
                window.parent.location.reload();
            }});
        }}

        function checkVersion() {{
            fetch('/app/static/version.txt', {{ cache: 'no-store' }})
                .then(function(r) {{ return r.text(); }})
                .then(function(v) {{
                    v = v.trim();
                    if (v && v !== CURRENT_VERSION) {{
                        var g = doc.getElementById('mcx-update-gate');
                        if (g) g.style.display = 'flex';
                    }}
                }})
                .catch(function() {{}});
        }}
        if (!window.__mcxVersionInterval) {{
            window.__mcxVersionInterval = setInterval(checkVersion, 45000);
            setTimeout(checkVersion, 4000);
        }}
    }})();
    </script>
    """
    components.html(html, height=0, width=0)


APP_VERSION = _current_app_version()
_write_version_file(APP_VERSION)
_register_pwa_manifest()

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

    /* Selos flutuantes do Streamlit Community Cloud ("Hosted with
    Streamlit", botão de Fork, "Created by ...") — classes com hash
    variável, por isso o seletor usa "contém" em vez do nome exato. */
    a[class*="viewerBadge"], div[class*="profileContainer"],
    div[class*="stateContainer"] { display: none !important; }

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
    /* Botão "Sair" discreto, no canto, como num app nativo — em vez de um
    botão grande ocupando uma linha inteira do conteúdo. */
    .mcx-corner-btn button {
        background: transparent !important;
        border: 1px solid rgba(201, 162, 39, 0.35) !important;
        color: rgba(242, 243, 247, 0.75) !important;
        font-size: 0.78rem !important;
        font-weight: 500 !important;
        padding: 0.25rem 0.7rem !important;
        border-radius: 999px !important;
        box-shadow: none !important;
        min-height: 0 !important;
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
        # Campo de texto livre, não lista suspensa — uma lista exporia o
        # nome de todos os promotores pra qualquer um que abrisse o app.
        nome_login = st.text_input("Nome do Promotor", placeholder="Nome e sobrenome")
        senha_login = st.text_input("Senha do Promotor", type="password")
        entrar = st.form_submit_button("Acessar", type="primary", use_container_width=True)
    if entrar:
        nome_digitado = nome_login.strip().lower()
        nome_cadastrado = next(
            (nome for nome in promoter_pins if nome.strip().lower() == nome_digitado),
            None,
        )
        if nome_cadastrado and promoter_pins.get(nome_cadastrado) == senha_login:
            st.session_state.promotor_atual = nome_cadastrado
            st.rerun()
        else:
            st.error("Nome ou senha incorretos.")
    st.stop()

promotor_fixo = st.session_state.promotor_atual

if promotor_fixo:
    # Só checa/bloqueia por atualização DEPOIS do login — antes disso
    # incomodaria sem necessidade quem ainda nem entrou no app.
    _show_update_gate(APP_VERSION)

    # Botão discreto no canto, tipo app nativo — em vez de um botão largo
    # ocupando uma linha inteira do conteúdo.
    corner_spacer, corner_btn = st.columns([5, 1])
    with corner_btn:
        st.markdown('<div class="mcx-corner-btn">', unsafe_allow_html=True)
        if st.button("Sair", key="btn_sair"):
            st.session_state.promotor_atual = None
            st.rerun()
        st.markdown('</div>', unsafe_allow_html=True)

render_header(f"{AVARIA_PROJECT_LABEL} — Registro de Avarias e Vencimentos")
if promotor_fixo:
    st.markdown(f'<span class="mcx-chip">Promotor: {promotor_fixo}</span>', unsafe_allow_html=True)
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
        preco = st.number_input("Preço (R$)", min_value=0.0, step=0.01, format="%.2f")
    else:
        validade = None
        preco = None
    quantidade = st.number_input("Quantidade", min_value=0, step=1, value=0)
    fotos = st.file_uploader(
        "Evidência Fotográfica", type=["jpg", "jpeg", "png"], accept_multiple_files=True
    )
    observacao = st.text_area("Observação (opcional)")

    submitted = st.form_submit_button("Registrar Ocorrência", type="primary", use_container_width=True)

    if submitted:
        if not loja or not promotor or not produto:
            st.error("Preencha loja, promotor e produto.")
        elif not fotos:
            st.error("Anexe pelo menos uma foto como evidência.")
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
                        preco=preco,
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
                preco=preco,
                quantidade=int(quantidade) or None,
                observacao=observacao,
                foto_paths=foto_paths,
            )

            st.success("Registro concluído com sucesso.")
