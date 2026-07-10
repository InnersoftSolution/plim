/**
 * Erro de regra de negócio. Lançado pelos serviços; a camada HTTP traduz
 * o `code` para status e o front traduz para mensagem amigável.
 */
export class DomainError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly httpStatus: number = 422,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

export class NotFoundError extends DomainError {
  constructor(code: string, message: string) {
    super(code, message, 404);
  }
}
