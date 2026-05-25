import * as React from "react";
import {
  useFormContext,
  FormProvider,
  useForm,
  Controller,
} from "react-hook-form";
import { cn } from "@/lib/utils";

export { FormProvider, useForm, useFormContext };

export function Form({ control, ...props }) {
  return <FormProvider control={control} {...props} />;
}

export function FormField({ name, control, render, ...props }) {
  const ctxControl = useFormContext()?.control || control;
  return (
    <Controller name={name} control={ctxControl} render={render} {...props} />
  );
}

export function FormItem({ className, ...props }) {
  return <div className={cn("space-y-2", className)} {...props} />;
}

export function FormLabel({ className, ...props }) {
  return (
    <label
      className={cn(
        "text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
        className,
      )}
      {...props}
    />
  );
}

export function FormControl({ ...props }) {
  return <div {...props} />;
}

export function FormDescription({ className, ...props }) {
  return (
    <p className={cn("text-sm text-muted-foreground", className)} {...props} />
  );
}

export function FormMessage({ className, ...props }) {
  return (
    <p
      className={cn("text-sm font-medium text-destructive", className)}
      {...props}
    />
  );
}
