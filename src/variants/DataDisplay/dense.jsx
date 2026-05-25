import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { DataPagination } from "@/components/data/DataPagination";
import { usePagination } from "@/hooks/usePagination";
import { cn } from "@/lib/utils";

function RecordCard({ columns, row }) {
  return (
    <Card className="p-3">
      <CardContent className="space-y-1 p-0">
        {columns.map((col) => (
          <div key={col.key} className="flex items-center justify-between gap-2 text-xs">
            <span className="text-muted-foreground">{col.label}</span>
            <span className="font-medium">{String(row[col.key] ?? "")}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function ResponsiveRecordView({ columns = [], rows = [], template = {} }) {
  const paginationConfig = template.pagination || {};
  const pageSizeDefault = paginationConfig.pageSize ?? 25;
  const paginationEnabled = paginationConfig.enabled ?? rows.length > pageSizeDefault;
  const { pageItems, page, totalPages, totalItems, pageSize, goToPage, setPageSize, rangeStart, rangeEnd } = usePagination(rows, { pageSize: pageSizeDefault });
  const displayRows = paginationEnabled ? pageItems : rows;

  return (
    <section aria-label="Records">
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow className="text-xs">
              {columns.map((col) => <TableHead key={col.key} className="h-8 py-1">{col.label}</TableHead>)}
            </TableRow>
          </TableHeader>
          <TableBody>
            {displayRows.map((row, i) => (
              <TableRow key={row.id || i} className="text-xs">
                {columns.map((col) => <TableCell key={col.key} className="h-8 py-1">{String(row[col.key] ?? "")}</TableCell>)}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className={cn("grid gap-2 md:hidden")}>
        {displayRows.map((row, i) => <RecordCard key={row.id || i} columns={columns} row={row} />)}
      </div>
      {paginationEnabled && totalItems > 0 && (
        <DataPagination page={page} totalPages={totalPages} totalItems={totalItems} pageSize={pageSize} rangeStart={rangeStart} rangeEnd={rangeEnd} onPageChange={goToPage} onPageSizeChange={setPageSize} pageSizeOptions={paginationConfig.pageSizeOptions || [10, 25, 50, 100]} />
      )}
    </section>
  );
}
