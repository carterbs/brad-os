/**
 * Interface matching the public API of BaseRepository.
 * Lives in types/ so middleware can reference it without importing from repositories/.
 */
export interface IBaseRepository<T extends { id: string }, CreateDTO, UpdateDTO> {
  create(data: CreateDTO): Promise<T>;
  findAll(): Promise<T[]>;
  findById(id: string): Promise<T | null>;
  update(id: string, data: UpdateDTO): Promise<T | null>;
  delete(id: string): Promise<boolean>;
}
