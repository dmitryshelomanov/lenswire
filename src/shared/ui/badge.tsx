import { cn } from '@/shared/lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { View, type ViewProps } from 'react-native';

import { Text } from '@/shared/ui/text';

const badgeVariants = cva('flex-row items-center rounded-md px-2 py-0.5', {
  variants: {
    variant: {
      default: 'bg-secondary',
      outline: 'border-border border',
      success: 'bg-emerald-500/15',
      warning: 'bg-amber-500/15',
      danger: 'bg-destructive/20',
      info: 'bg-sky-500/15',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
});

const badgeTextVariants = cva('text-xs font-semibold', {
  variants: {
    variant: {
      default: 'text-secondary-foreground',
      outline: 'text-foreground',
      success: 'text-emerald-400',
      warning: 'text-amber-400',
      danger: 'text-red-400',
      info: 'text-sky-400',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
});

type BadgeProps = ViewProps &
  VariantProps<typeof badgeVariants> & {
    label: string;
  };

function Badge({ className, variant, label, ...props }: BadgeProps) {
  return (
    <View className={cn(badgeVariants({ variant }), className)} {...props}>
      <Text className={badgeTextVariants({ variant })}>{label}</Text>
    </View>
  );
}

export { Badge, badgeVariants };
