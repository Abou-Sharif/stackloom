import { Card, CardContent } from "@/components/ui/card";
import { DataPagination } from "@/components/data/DataPagination";
import { usePagination } from "@/hooks/usePagination";
import { cn } from "@/lib/utils";

export function ResponsiveRecordView({ columns = [], rows = [], template = {} }) {
  const paginationConfig = template.pagination || {};
  const pageSizeDefault = paginationConfig.pageSize ?? 12;
  const paginationEnabled = paginationConfig.enabled ?? rows.length > pageSizeDefault;
  const { pageItems, page, totalPages, totalItems, pageSize, goToPage, setPageSize, rangeStart, rangeEnd } = usePagination(rows, { pageSize: pageSizeDefault });
  const displayRows = paginationEnabled ? pageItems : rows;

  const gridCols = {
    auto: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
    two: "grid-cols-1 md:grid-cols-2",
    three: "grid-cols-1 sm:grid-cols-2 xl:grid-cols-3",
    four: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4",
  };

  const columnsOption = template.columns || "auto";

  return (
    <section aria-label="Records">
      <div className={cn("grid gap-4", gridCols[columnsOption] || gridCols.auto)}>
        {displayRows.map((row, i) => (
          <Card key={row.id || i} className="overflow-hidden transition-shadow hover:shadow-md">
            <CardContent className="space-y-2 p-4">
              {columns.map((col) => (
                <div key={col.key} className="flex flex-col gap-0.5">
                  <span className="text-xs text-muted-foreground">{col.label}</span>
                  <span className="text-sm font-medium">{String(row[col.key] ?? "")}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
      {paginationEnabled && totalItems > 0 && (
        <DataPagination page={page} totalPages={totalPages} totalItems={totalItems} pageSize={pageSize} rangeStart={rangeStart} rangeEnd={rangeEnd} onPageChange={goToPage} onPageSizeChange={setPageSize} pageSizeOptions={paginationConfig.pageSizeOptions || [8, 12, 24, 48]} />
      )}
    </section>
  );
}
