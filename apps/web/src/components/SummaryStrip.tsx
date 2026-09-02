import type { ReactNode } from 'react';
import './summarystrip.css';

/**
 * A faixa de resumo do Plim: uma coluna por número, separadas por filete, com
 * rótulo miúdo em caixa alta, o valor grande e uma nota de apoio embaixo.
 *
 * Existe como componente porque a mesma faixa vive em mais de uma tela (o
 * resumo do período em Movimentações e os números do topo da Home). Cada tela
 * tinha a sua versão, e elas foram divergindo: mesma informação com duas caras
 * (Rafaelle, 1 set). Regra de cor mantida: DIREÇÃO é ícone, VEREDITO é cor.
 */
export interface SummaryItem {
  /** Chave estável para a lista. */
  key: string;
  label: string;
  /** Ícone do rótulo. Opcional: a coluna de veredito não usa. */
  icon?: ReactNode;
  /** Cor do ícone pelo significado: entrada, saída ou neutro. */
  iconTone?: 'in' | 'out' | 'late';
  /** Valor já formatado (a formatação é decisão de quem chama). */
  value: string;
  /** Linha de apoio: contagem, período, ressalva. */
  note?: string;
  /** Veredito do número: pinta o valor de vermelho ou verde. */
  tone?: 'neg' | 'pos';
  /** Destaca a coluna (corpo maior). Use em uma só: é a resposta da faixa. */
  hero?: boolean;
  /** Torna a coluna clicável. */
  onClick?: () => void;
  /** Conteúdo extra ancorado no canto da coluna (ex.: o botão de ajuda). */
  corner?: ReactNode;
}

export function SummaryStrip({
  items,
  ariaLabel,
}: {
  items: SummaryItem[];
  ariaLabel: string;
}) {
  return (
    <section
      className={'fin2-sum' + (items.length === 4 ? ' fin2-sum--4' : '')}
      aria-label={ariaLabel}
    >
      {items.map((item) => {
        const conteudo = (
          <>
            <span className="fin2-sum__lab">
              {item.icon && (
                <span
                  className={
                    'fin2-sum__ic' + (item.iconTone ? ` fin2-sum__ic--${item.iconTone}` : '')
                  }
                >
                  {item.icon}
                </span>
              )}
              {item.label}
            </span>
            <span
              className={
                'fin2-sum__val' +
                (item.hero ? ' fin2-sum__val--big' : '') +
                (item.tone ? ` is-${item.tone}` : '')
              }
              data-financial
            >
              {item.value}
            </span>
            {item.note && <span className="fin2-sum__note">{item.note}</span>}
          </>
        );
        const classe = item.hero ? 'fin2-sum__hero' : undefined;
        // Coluna clicável é um botão de verdade (teclado e leitor de tela
        // ganham junto); o resto continua sendo um bloco simples.
        return item.onClick ? (
          <div className={classe} key={item.key}>
            <button
              type="button"
              className="fin2-sum__btn"
              onClick={item.onClick}
              aria-label={`${item.label}: ${item.value}. Ver detalhes.`}
            >
              {conteudo}
            </button>
            {item.corner}
          </div>
        ) : (
          <div className={classe} key={item.key}>
            {conteudo}
            {item.corner}
          </div>
        );
      })}
    </section>
  );
}
