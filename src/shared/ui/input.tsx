import * as React from 'react';
import { Platform, TextInput, type TextInputProps } from 'react-native';

import { cn } from '@/shared/lib/utils';

function Input({ className, ...props }: TextInputProps & React.RefAttributes<TextInput>) {
  return (
    <TextInput
      className={cn(
        'border-input bg-background text-foreground flex h-10 w-full min-w-0 flex-row rounded-md border px-3 py-2 text-sm shadow-sm shadow-black/5',
        Platform.select({
          web: 'outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
        }),
        props.editable === false && 'opacity-50',
        className,
      )}
      placeholderTextColor="hsl(0 0% 63.9%)"
      {...props}
    />
  );
}

export { Input };
