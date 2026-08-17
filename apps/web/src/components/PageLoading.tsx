import './pageloading.css';

/**
 * Espera de página inteira.
 *
 * Antes cada tela mostrava uma linha solta ("carregando acertos…"). Como a
 * linha ocupa quase nada, a página encolhia, a barra de rolagem sumia e tudo
 * dava um salto lateral quando o conteúdo voltava: era isso que piscava a cada
 * clique no menu. O esqueleto mantém a altura e o desenho da tela.
 */
export function PageLoading({ label = 'carregando…' }: { label?: string }) {
  return (
    <div className="pgload" role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      <div className="pgload__title" />
      <div className="pgload__sub" />
      <div className="pgload__card" />
      <div className="pgload__card pgload__card--short" />
    </div>
  );
}
