import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ToggleSwitch } from '../ToggleSwitch';

describe('ToggleSwitch', () => {
  it('should render with correct aria attributes', () => {
    const onChange = vi.fn();
    render(
      <ToggleSwitch
        id="test-toggle"
        label="Test Toggle"
        checked={false}
        onChange={onChange}
      />
    );

    const toggle = screen.getByRole('switch');
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(toggle).toHaveAttribute('aria-label', 'Test Toggle');
  });

  it('should call onChange when clicked', () => {
    const onChange = vi.fn();
    render(
      <ToggleSwitch
        id="test-toggle"
        label="Test Toggle"
        checked={false}
        onChange={onChange}
      />
    );

    const toggle = screen.getByRole('switch');
    fireEvent.click(toggle);

    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('should call onChange with opposite value', () => {
    const onChange = vi.fn();
    render(
      <ToggleSwitch
        id="test-toggle"
        label="Test Toggle"
        checked={true}
        onChange={onChange}
      />
    );

    const toggle = screen.getByRole('switch');
    fireEvent.click(toggle);

    expect(onChange).toHaveBeenCalledWith(false);
  });

  it('should not call onChange when disabled', () => {
    const onChange = vi.fn();
    render(
      <ToggleSwitch
        id="test-toggle"
        label="Test Toggle"
        checked={false}
        onChange={onChange}
        disabled={true}
      />
    );

    const toggle = screen.getByRole('switch');
    fireEvent.click(toggle);

    expect(onChange).not.toHaveBeenCalled();
  });

  it('should be disabled when disabled prop is true', () => {
    const onChange = vi.fn();
    render(
      <ToggleSwitch
        id="test-toggle"
        label="Test Toggle"
        checked={false}
        onChange={onChange}
        disabled={true}
      />
    );

    const toggle = screen.getByRole('switch');
    expect(toggle).toBeDisabled();
  });

  it('should update aria-checked when checked prop changes', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <ToggleSwitch
        id="test-toggle"
        label="Test Toggle"
        checked={false}
        onChange={onChange}
      />
    );

    const toggle = screen.getByRole('switch');
    expect(toggle).toHaveAttribute('aria-checked', 'false');

    rerender(
      <ToggleSwitch
        id="test-toggle"
        label="Test Toggle"
        checked={true}
        onChange={onChange}
      />
    );

    expect(toggle).toHaveAttribute('aria-checked', 'true');
  });
});
