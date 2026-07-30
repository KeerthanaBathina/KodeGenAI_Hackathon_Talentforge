import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RequisitionFilter } from '../RequisitionFilter';

const options = [
  { id: 'req-1', title: 'Senior Backend Engineer - London' },
  { id: 'req-2', title: 'Product Manager - Remote' }
];

describe('RequisitionFilter', () => {
  it('exposes accessible search and select controls', () => {
    render(
      <RequisitionFilter
        options={options}
        selectedRequisitionId={undefined}
        searchTerm=""
        loading={false}
        onSearchTermChange={vi.fn()}
        onSelectionChange={vi.fn()}
        onClear={vi.fn()}
      />
    );

    expect(screen.getByLabelText('Search requisitions')).toBeInTheDocument();
    expect(screen.getByLabelText('Requisition')).toBeInTheDocument();
  });

  it('filters visible requisition options by search term', () => {
    render(
      <RequisitionFilter
        options={options}
        selectedRequisitionId={undefined}
        searchTerm="Backend"
        loading={false}
        onSearchTermChange={vi.fn()}
        onSelectionChange={vi.fn()}
        onClear={vi.fn()}
      />
    );

    expect(screen.getByRole('option', { name: 'Senior Backend Engineer - London' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Product Manager - Remote' })).not.toBeInTheDocument();
  });

  it('triggers selection and clear callbacks', () => {
    const onSelectionChange = vi.fn();
    const onClear = vi.fn();

    render(
      <RequisitionFilter
        options={options}
        selectedRequisitionId="req-1"
        searchTerm="Backend"
        loading={false}
        onSearchTermChange={vi.fn()}
        onSelectionChange={onSelectionChange}
        onClear={onClear}
      />
    );

    fireEvent.change(screen.getByLabelText('Requisition selection'), {
      target: { value: 'req-1' }
    });
    expect(onSelectionChange).toHaveBeenCalledWith('req-1');

    fireEvent.click(screen.getByRole('button', { name: 'Clear Filter' }));
    expect(onClear).toHaveBeenCalled();
  });
});
