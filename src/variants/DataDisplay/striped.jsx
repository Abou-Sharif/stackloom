import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { DataPagination } from "@/components/data/DataPagination";
import { usePagination } from "@/hooks/usePagination";
import { cn } from "@/lib/utils";

function RecordCard({ columns, row, index }) {
  return (
    <Card className={cn("p-4", index % 2 === 1 && "bg-muted/30")}>
      <CardContent className="space-y-2 p-0">
        {columns.map((col) => (
          <div key={col.key} className="flex items-center justify-between gap-4 text-sm">
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
  const pageSizeDefault = paginationConfig.pageSize ?? 10;
  const paginationEnabled = paginationConfig.enabled ?? rows.length > pageSizeDefault;
  const { pageItems, page, totalPages, totalItems, pageSize, goToPage, setPageSize, rangeStart, rangeEnd } = usePagination(rows, { pageSize: pageSizeDefault });
  const displayRows = paginationEnabled ? pageItems : rows;

  return (
    <section aria-label="Records">
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((col) => <TableHead key={col.key}>{col.label}</TableHead>)}
            </TableRow>
          </TableHeader>
          <TableBody>
            {displayRows.map((row, i) => (
              <TableRow key={row.id || i} className={cn(i % 2 === 1 && "bg-muted/30")}>
                {columns.map((col) => <TableCell key={col.key}>{String(row[col.key] ?? "")}</TableCell>)}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className={cn("grid gap-3 md:hidden")}>
        {displayRows.map((row, i) => <RecordCard key={row.id || i} columns={columns} row={row} index={i} />)}
      </div>
      {paginationEnabled && totalItems > 0 && (
        <DataPagination page={page} totalPages={totalPages} totalItems={totalItems} pageSize={pageSize} rangeStart={rangeStart} rangeEnd={rangeEnd} onPageChange={goToPage} onPageSizeChange={setPageSize} pageSizeOptions={paginationConfig.pageSizeOptions || [5, 10, 20, 50]} />
      )}
    </section>
  );
}
