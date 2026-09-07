/* =========================================================
   NOITES EM TOKYO
   JAVASCRIPT
   FASES DO SISTEMA — NAVEGAÇÃO E REGRAS
========================================================= */

document.addEventListener("DOMContentLoaded", () => {


    /* =====================================================
       ANO AUTOMÁTICO
    ====================================================== */

    const year = document.getElementById("current-year");

    if (year) {
        year.textContent = new Date().getFullYear();
    }


    /* =====================================================
       NAVEGAÇÃO ATIVA
    ====================================================== */

    const navLinks = document.querySelectorAll(".nav-link");

    const sections = document.querySelectorAll(
        "main section[id]"
    );


    const observer = new IntersectionObserver(
        (entries) => {

            entries.forEach((entry) => {

                if (!entry.isIntersecting) {
                    return;
                }

                const id =
                    entry.target.getAttribute("id");

                navLinks.forEach((link) => {

                    link.classList.remove("active");

                    if (
                        link.getAttribute("href") ===
                        `#${id}`
                    ) {
                        link.classList.add("active");
                    }

                });

            });

        },
        {
            rootMargin: "-30% 0px -60% 0px",
            threshold: 0
        }
    );


    sections.forEach((section) => {
        observer.observe(section);
    });


    /* =====================================================
       SCROLL SUAVE
    ====================================================== */

    navLinks.forEach((link) => {

        link.addEventListener(
            "click",
            (event) => {

                const targetId =
                    link.getAttribute("href");

                if (
                    !targetId ||
                    !targetId.startsWith("#")
                ) {
                    return;
                }

                const target =
                    document.querySelector(targetId);

                if (!target) {
                    return;
                }

                event.preventDefault();

                target.scrollIntoView({
                    behavior: "smooth",
                    block: "start"
                });

            }
        );

    });


    /* =====================================================
       REVELAÇÃO DOS ELEMENTOS
    ====================================================== */

    const revealElements =
        document.querySelectorAll(
            ".feature-card, " +
            ".attribute-card, " +
            ".kagune-entry, " +
            ".kakuja-card, " +
            ".small-panel, " +
            ".rank-card, " +
            ".district-grid article, " +
            ".investigation-grid article"
        );


    const revealObserver =
        new IntersectionObserver(
            (entries, observer) => {

                entries.forEach((entry) => {

                    if (!entry.isIntersecting) {
                        return;
                    }

                    entry.target.classList.add(
                        "revealed"
                    );

                    observer.unobserve(
                        entry.target
                    );

                });

            },
            {
                threshold: 0.08
            }
        );


    revealElements.forEach((element) => {

        element.style.opacity = "0";

        element.style.transform =
            "translateY(16px)";

        element.style.transition =
            "opacity .6s ease, transform .6s ease";

        revealObserver.observe(element);

    });


    /* =====================================================
       CSS DA REVELAÇÃO
    ====================================================== */

    const style =
        document.createElement("style");

    style.textContent = `

        .revealed {
            opacity: 1 !important;
            transform: translateY(0) !important;
        }

    `;

    document.head.appendChild(style);


    /* =====================================================
       SISTEMA DE DADOS
    ====================================================== */

    const modificadores = {

        0: -1,
        1: 0,
        2: 1,
        3: 2,
        4: 3,
        5: 4,
        6: 5,
        7: 6,
        8: 7,
        9: 8,
        10: 9

    };


    /* =====================================================
       MODIFICADOR
    ====================================================== */

    function calcularModificador(valor) {

        valor =
            Number(valor);

        if (
            Number.isNaN(valor)
        ) {
            return 0;
        }

        valor =
            Math.max(
                0,
                Math.min(
                    10,
                    valor
                )
            );

        return modificadores[valor];
    }


    /* =====================================================
       DADOS
    ====================================================== */

    function rolarDado(lados = 10) {

        return (
            Math.floor(
                Math.random() * lados
            ) + 1
        );

    }


    function rolar2d10() {

        const dado1 =
            rolarDado(10);

        const dado2 =
            rolarDado(10);

        return {

            dado1,
            dado2,

            total:
                dado1 + dado2,

            critico:
                dado1 === 10 &&
                dado2 === 10,

            falhaCritica:
                dado1 === 1 &&
                dado2 === 1

        };

    }


    /* =====================================================
       VIDA
       FASE 1
       
       Vida = 20 + Constituição × 2
    ====================================================== */

    function calcularVida(constituicao) {

        constituicao =
            Number(constituicao);

        if (
            Number.isNaN(constituicao)
        ) {
            return 20;
        }

        return (
            20 +
            (constituicao * 2)
        );

    }


    /* =====================================================
       FADIGA
       FASE 1
       
       Fadiga = 5 + modificador de Constituição
    ====================================================== */

    function calcularFadiga(constituicao) {

        const modificador =
            calcularModificador(
                constituicao
            );

        return (
            5 +
            modificador
        );

    }


    /* =====================================================
       CA
       FASE 1
       
       CA = 10 + modificador de Agilidade
    ====================================================== */

    function calcularCA(agilidade) {

        return (
            10 +
            calcularModificador(
                agilidade
            )
        );

    }


    /* =====================================================
       INICIATIVA
       
       2d10 + modificador de Agilidade
    ====================================================== */

    function rolarIniciativa(agilidade) {

        const dados =
            rolar2d10();

        const modificador =
            calcularModificador(
                agilidade
            );

        return {

            ...dados,

            modificador,

            resultado:
                dados.total +
                modificador

        };

    }


    /* =====================================================
       ATAQUE
       
       2d10 + modificador
       
       Acerta se:
       resultado >= CA
    ====================================================== */

    function realizarAtaque(
        atributo,
        caAlvo
    ) {

        const dados =
            rolar2d10();

        const modificador =
            calcularModificador(
                atributo
            );

        const resultado =
            dados.total +
            modificador;

        const acerto =
            dados.critico ||
            resultado >= Number(caAlvo);

        return {

            ...dados,

            modificador,

            resultado,

            caAlvo,

            acerto

        };

    }


    /* =====================================================
       DANO DESARMADO
       
       1d6 + modificador de Força
    ====================================================== */

    function danoDesarmado(
        forca,
        critico = false
    ) {

        const modificador =
            calcularModificador(
                forca
            );

        const danoBase =
            critico
                ? 6
                : rolarDado(6);

        return {

            dado:
                danoBase,

            modificador,

            dano:
                Math.max(
                    0,
                    danoBase +
                    modificador
                )

        };

    }


    /* =====================================================
       ESQUIVA
       
       +2 CA contra um ataque
    ====================================================== */

    function aplicarEsquiva(caAtual) {

        return (
            Number(caAtual) + 2
        );

    }


    /* =====================================================
       DEFESA EMERGENCIAL
       
       Reduz 1d6 de dano
    ====================================================== */

    function defesaEmergencial(dano) {

        const reducao =
            rolarDado(6);

        return {

            danoOriginal:
                Number(dano),

            reducao,

            danoFinal:
                Math.max(
                    0,
                    Number(dano) -
                    reducao
                )

        };

    }


    /* =====================================================
       TESTE DE SOBREVIVÊNCIA
       
       2d10 + Constituição
       
       Observação:
       A regra da Fase 1 utiliza Constituição
       diretamente neste teste.
    ====================================================== */

    function testeSobrevivencia(
        constituicao,
        dificuldade = 10
    ) {

        const dados =
            rolar2d10();

        const resultado =
            dados.total +
            Number(constituicao);

        return {

            ...dados,

            resultado,

            dificuldade,

            sucesso:
                resultado >= dificuldade

        };

    }


    /* =====================================================
       REGENERAÇÃO GHOUL
       
       1d6 + modificador de Fome
    ====================================================== */

    function regeneracaoGhoul(fome) {

        const dado =
            rolarDado(6);

        const modificador =
            calcularModificador(
                fome
            );

        return {

            dado,

            modificador,

            recuperacao:
                Math.max(
                    0,
                    dado + modificador
                )

        };

    }


    /* =====================================================
       RC
    ====================================================== */

    function determinarEstagioRC(rc) {

        rc =
            Number(rc);

        if (rc < 1000) {
            return "Ghoul Iniciante";
        }

        if (rc < 3000) {
            return "Ghoul Experiente";
        }

        if (rc < 6000) {
            return "Ghoul Forte";
        }

        if (rc < 10000) {
            return "Elite";
        }

        if (rc < 15000) {
            return "Semi-Kakuja";
        }

        return "Kakuja Completa";

    }


    /* =====================================================
       CICLO DOS KAGUNES
    ====================================================== */

    const cicloKagune = {

        Ukaku: "Bikaku",

        Bikaku: "Rinkaku",

        Rinkaku: "Koukaku",

        Koukaku: "Ukaku"

    };


    function possuiVantagemKagune(
        atacante,
        defensor
    ) {

        if (
            !atacante ||
            !defensor
        ) {
            return false;
        }

        return (
            cicloKagune[atacante] ===
            defensor
        );

    }


    /* =====================================================
       UM OLHO
    ====================================================== */

    function determinarGhoulUmOlho() {

        const resultado =
            rolarDado(100);

        return {

            resultado,

            umOlho:
                resultado >= 96

        };

    }


    /* =====================================================
       FOME
    ====================================================== */

    function aumentarFome(
        fomeAtual,
        missoesSemAlimentacao = 1
    ) {

        return (
            Number(fomeAtual) +
            Number(missoesSemAlimentacao)
        );

    }


    /* =====================================================
       LIMITADOR DE ATRIBUTO
    ====================================================== */

    function limitar(
        valor,
        minimo = 0,
        maximo = 10
    ) {

        return Math.max(
            minimo,
            Math.min(
                maximo,
                Number(valor)
            )
        );

    }


    /* =====================================================
       EXPOSIÇÃO GLOBAL
       
       Permite que outras partes do projeto,
       futuras fichas e ferramentas utilizem
       as regras sem duplicar código.
    ====================================================== */

    window.NoitesEmTokyo = {

        dados: {

            modificadores

        },

        dadosRPG: {

            rolarDado,

            rolar2d10,

            calcularModificador,

            calcularVida,

            calcularFadiga,

            calcularCA,

            rolarIniciativa,

            realizarAtaque,

            danoDesarmado,

            aplicarEsquiva,

            defesaEmergencial,

            testeSobrevivencia,

            regeneracaoGhoul,

            determinarEstagioRC,

            possuiVantagemKagune,

            determinarGhoulUmOlho,

            aumentarFome,

            limitar

        },

        kagune: {

            ciclo:
                cicloKagune

        }

    };


    /* =====================================================
       LOG INICIAL
    ====================================================== */

    console.log(
        "%c NOITES EM TOKYO ",
        "color:#d83243;font-weight:bold;"
    );

    console.log(
        "Manual carregado."
    );

    console.log(
        "Fase 1 de combate carregada."
    );

});
