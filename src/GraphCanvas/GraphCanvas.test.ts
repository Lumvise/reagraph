import React, { act, createRef } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, test, vi } from 'vitest';

import type { CosmosGraphCanvasRef, GraphCanvasRef } from './GraphCanvas';
import { GraphCanvas } from './GraphCanvas';

const { graphInstances, MockCosmosGraph } = vi.hoisted(() => {
  class MockCosmosGraph {
    config: unknown;
    destroyed = false;

    constructor(_container: HTMLDivElement, config: unknown) {
      this.config = config;
      graphInstances.push(this);
    }

    destroy = vi.fn(() => {
      this.destroyed = true;
    });
    fitView = vi.fn();
    fitViewByPointIndices = vi.fn();
    getPointPositions = vi.fn(() => []);
    getZoomLevel = vi.fn(() => 1);
    pause = vi.fn();
    render = vi.fn();
    setConfig = vi.fn();
    setLinkArrows = vi.fn();
    setLinkColors = vi.fn();
    setLinks = vi.fn();
    setLinkWidths = vi.fn();
    setPointColors = vi.fn();
    setPointPositions = vi.fn();
    setPointSizes = vi.fn();
    unpause = vi.fn();
    zoom = vi.fn();
    zoomToPointByIndex = vi.fn();
  }

  const graphInstances: MockCosmosGraph[] = [];

  return { graphInstances, MockCosmosGraph };
});

vi.mock('@cosmos.gl/graph', () => ({
  Graph: MockCosmosGraph
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  graphInstances.length = 0;
  vi.clearAllMocks();
});

const emptyGraph = {
  edges: [],
  nodes: []
};

const typeCheckGraphCanvasRefs = () => {
  const threeRef = createRef<GraphCanvasRef>();
  const cosmosRef = createRef<CosmosGraphCanvasRef>();

  GraphCanvas({ ref: threeRef, ...emptyGraph });
  GraphCanvas({ ref: cosmosRef, renderEngine: 'cosmos', ...emptyGraph });

  // @ts-expect-error Cosmos refs intentionally do not expose Three camera controls.
  cosmosRef.current?.getControls();

  // @ts-expect-error Three GraphCanvasRef is not valid for renderEngine="cosmos".
  GraphCanvas({ ref: threeRef, renderEngine: 'cosmos', ...emptyGraph });
};
void typeCheckGraphCanvasRefs;

describe('GraphCanvas cosmos renderer', () => {
  test('mounts through GraphCanvas and exposes the cosmos ref contract', async () => {
    const container = document.createElement('div');
    const ref = createRef<CosmosGraphCanvasRef>();
    const root = createRoot(container);

    await act(async () => {
      root.render(
        React.createElement(GraphCanvas, {
          ref,
          renderEngine: 'cosmos',
          labelType: 'none',
          nodes: [
            { id: 'one', label: 'One' },
            { id: 'two', label: 'Two' }
          ],
          edges: [{ id: 'edge', source: 'one', target: 'two' }]
        })
      );
    });

    expect(graphInstances).toHaveLength(1);
    expect(ref.current?.getCosmosGraph()).toBe(graphInstances[0]);
    expect('getControls' in ref.current!).toBe(false);
    expect(graphInstances[0].setConfig).toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });

    expect(graphInstances[0].destroy).toHaveBeenCalled();
  });
});
