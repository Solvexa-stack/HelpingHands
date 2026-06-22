export declare class PaginationDto {
    page?: number;
    limit?: number;
    search?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
}
export declare function paginate(page?: number, limit?: number): {
    skip: number;
    take: number;
};
export declare function paginatedResponse<T>(data: T[], total: number, page: number, limit: number): {
    data: T[];
    meta: {
        total: number;
        page: number;
        limit: number;
        totalPages: number;
        hasNextPage: boolean;
        hasPreviousPage: boolean;
    };
};
