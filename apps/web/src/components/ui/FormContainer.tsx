interface FormContainerProps {
  children: React.ReactNode;
  className?: string;
}

export function FormContainer({ children, className }: FormContainerProps) {
  return <div className={`form-container ${className ?? ''}`}>{children}</div>;
}