import { useEffect, useRef, useState } from 'react';

/**
 * Barreira progressiva do login: a partir do 3º erro seguido o formulário
 * trava por 30s, e cada erro seguinte dobra a espera (60s, 120s, teto 300s).
 *
 * Por que assim, e não "errou 3 vezes, conta bloqueada": bloqueio seco cria um
 * ataque novo, qualquer um que saiba o e-mail de um sócio erra de propósito e
 * tranca o dono de fora. O atraso progressivo pune robô e chute repetido sem
 * nunca trancar o dono legítimo. É a camada de tela; os limites por IP e o
 * CAPTCHA do Supabase Auth são as camadas de servidor.
 *
 * O estado vive em localStorage para sobreviver ao refresh da página, que é o
 * primeiro reflexo de quem quer zerar o contador. Não é inviolável (nada no
 * navegador é), mas quem limpa storage para continuar chutando cai nas camadas
 * de servidor.
 */
const CHAVE = 'plim:auth:barreira';
const ERROS_LIVRES = 2; // a partir do 3º erro trava
const BASE_SEGUNDOS = 30;
const TETO_SEGUNDOS = 300;

type Estado = { erros: number; travadoAte: number };

function ler(): Estado {
  try {
    const bruto = localStorage.getItem(CHAVE);
    if (!bruto) return { erros: 0, travadoAte: 0 };
    const e = JSON.parse(bruto) as Estado;
    return { erros: e.erros || 0, travadoAte: e.travadoAte || 0 };
  } catch {
    return { erros: 0, travadoAte: 0 };
  }
}

function gravar(e: Estado): void {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(e));
  } catch {
    /* storage indisponível: a barreira vira só de memória, e tudo bem */
  }
}

export function useAuthBarrier() {
  const [estado, setEstado] = useState<Estado>(ler);
  const [agora, setAgora] = useState(() => Date.now());
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const travado = estado.travadoAte > agora;
  const segundosRestantes = travado ? Math.ceil((estado.travadoAte - agora) / 1000) : 0;

  // O relógio só corre enquanto há trava: sem erro, sem timer.
  useEffect(() => {
    if (!travado) return;
    timer.current = setInterval(() => setAgora(Date.now()), 1000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [travado]);

  function registrarErro(): void {
    const erros = estado.erros + 1;
    let travadoAte = 0;
    if (erros > ERROS_LIVRES) {
      const dobras = erros - ERROS_LIVRES - 1;
      const espera = Math.min(BASE_SEGUNDOS * 2 ** dobras, TETO_SEGUNDOS);
      travadoAte = Date.now() + espera * 1000;
    }
    const novo = { erros, travadoAte };
    setEstado(novo);
    setAgora(Date.now());
    gravar(novo);
  }

  function limpar(): void {
    const novo = { erros: 0, travadoAte: 0 };
    setEstado(novo);
    gravar(novo);
  }

  return { travado, segundosRestantes, registrarErro, limpar };
}
