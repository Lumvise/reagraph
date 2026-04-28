import { Graph as CosmosGraph } from '@cosmos.gl/graph';
import type Graph from 'graphology';
import Graphology from 'graphology';
import type { Ref } from 'react';
import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState
} from 'react';

import { lightTheme } from '../themes';
import type { InternalGraphEdge, InternalGraphNode } from '../types';
import type { PreparedCosmosGraph } from './cosmos';
import {
  applyCosmosBuffers,
  buildCosmosBuffers,
  buildCosmosConfig,
  prepareCosmosGraph
} from './cosmos';
import type { CosmosGraphCanvasRef, GraphCanvasProps } from './GraphCanvas';
import css from './GraphCanvas.module.css';

interface ResizableCosmosGraph {
  resizeCanvas?: (force?: boolean) => void;
}

const EMPTY_IDS: string[] = [];

const emptyPreparedGraph = (graph: Graph): PreparedCosmosGraph => ({
  graph,
  nodes: [],
  edges: [],
  nodeIndexById: new Map()
});

const resizeCosmosGraph = (graph: CosmosGraph) => {
  (graph as unknown as ResizableCosmosGraph).resizeCanvas?.(true);
};

export const CosmosGraphCanvas = forwardRef<
  CosmosGraphCanvasRef,
  GraphCanvasProps
>(
  (
    {
      layoutType = 'forceDirected2d',
      sizingType = 'default',
      labelType = 'auto',
      theme = lightTheme,
      animated = true,
      defaultNodeSize = 7,
      minNodeSize = 5,
      maxNodeSize = 15,
      edges,
      nodes,
      disabled,
      draggable,
      selections = EMPTY_IDS,
      actives = EMPTY_IDS,
      collapsedNodeIds = EMPTY_IDS,
      sizingAttribute,
      clusterAttribute,
      layoutOverrides,
      edgeInterpolation = 'linear',
      edgeArrowPosition = 'end',
      aggregateEdges,
      cosmosConfig,
      onCanvasClick,
      onNodeClick,
      onNodePointerOver,
      onNodePointerOut,
      onEdgeClick,
      onEdgePointerOver,
      onEdgePointerOut
    },
    ref: Ref<CosmosGraphCanvasRef>
  ) => {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const cosmosRef = useRef<CosmosGraph | null>(null);
    const graphRef = useRef<Graph>(new Graphology({ multi: true }));
    const didFitViewRef = useRef(false);
    const preparedRef = useRef<PreparedCosmosGraph>(
      emptyPreparedGraph(graphRef.current)
    );
    const hoveredNodeIdRef = useRef<string | null>(null);
    const hoveredEdgeIdRef = useRef<string | null>(null);
    const [preparedGraph, setPreparedGraph] = useState<PreparedCosmosGraph>(
      preparedRef.current
    );
    const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
    const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null);

    const getNodeIndices = useCallback((nodeIds?: string[]) => {
      const prepared = preparedRef.current;

      if (!nodeIds?.length) {
        return prepared.nodes.map((_, index) => index);
      }

      return nodeIds.reduce<number[]>((indices, id) => {
        const index = prepared.nodeIndexById.get(id);
        if (index === undefined) {
          throw new Error(`Attempted to center ${id} but it was not found.`);
        }

        indices.push(index);
        return indices;
      }, []);
    }, []);

    const getNodeByIndex = useCallback(
      (index: number): InternalGraphNode | undefined =>
        preparedRef.current.nodes[index],
      []
    );

    const getEdgeByIndex = useCallback(
      (index: number): InternalGraphEdge | undefined =>
        preparedRef.current.edges[index],
      []
    );

    useImperativeHandle(
      ref,
      () => ({
        centerGraph: (nodeIds, opts) => {
          const graph = cosmosRef.current;
          if (!graph) return;

          const duration = opts?.animated === false ? 0 : 250;
          const indices = getNodeIndices(nodeIds);

          if (
            !indices.length ||
            indices.length === preparedRef.current.nodes.length
          ) {
            graph.fitView(duration, 0.1);
          } else if (indices.length === 1) {
            graph.zoomToPointByIndex(indices[0], duration);
          } else {
            graph.fitViewByPointIndices(indices, duration, 0.1);
          }
        },
        fitNodesInView: (nodeIds, opts) => {
          const graph = cosmosRef.current;
          if (!graph) return;

          graph.fitViewByPointIndices(
            getNodeIndices(nodeIds),
            opts?.animated === false ? 0 : 250,
            0.1
          );
        },
        zoomIn: () => {
          const graph = cosmosRef.current;
          graph?.zoom(graph.getZoomLevel() * 1.5, 250);
        },
        zoomOut: () => {
          const graph = cosmosRef.current;
          graph?.zoom(graph.getZoomLevel() / 1.5, 250);
        },
        resetControls: (animated?: boolean) =>
          cosmosRef.current?.fitView(animated === false ? 0 : 250, 0.1),
        getGraph: () => preparedRef.current.graph,
        getCosmosGraph: () => cosmosRef.current ?? undefined,
        exportCanvas: () => {
          cosmosRef.current?.render(0);
          return (
            containerRef.current?.querySelector('canvas')?.toDataURL() ?? ''
          );
        },
        freeze: () => cosmosRef.current?.pause(),
        unFreeze: () => cosmosRef.current?.unpause()
      }),
      [getNodeIndices]
    );

    const config = useMemo(
      () =>
        buildCosmosConfig({
          config: cosmosConfig,
          defaultNodeSize,
          disabled,
          draggable,
          edgeArrowPosition,
          edgeInterpolation,
          theme,
          onBackgroundClick: event => {
            if (!disabled) {
              onCanvasClick?.(event);
            }
          },
          onPointClick: (index, _position, event) => {
            if (disabled) return;

            const prepared = preparedRef.current;
            const node = getNodeByIndex(index);
            if (!node) return;

            onNodeClick?.(
              node,
              {
                canCollapse: prepared.edges.some(
                  edge => edge.source === node.id
                ),
                isCollapsed: collapsedNodeIds.includes(node.id)
              },
              event as never
            );
          },
          onPointMouseOver: (index, _position, event) => {
            const node = getNodeByIndex(index);
            if (!node) return;

            hoveredNodeIdRef.current = node.id;
            setHoveredNodeId(node.id);
            onNodePointerOver?.(node, event as never);
          },
          onPointMouseOut: event => {
            const node = preparedRef.current.nodes.find(
              n => n.id === hoveredNodeIdRef.current
            );

            hoveredNodeIdRef.current = null;
            setHoveredNodeId(null);

            if (node) {
              onNodePointerOut?.(node, event as never);
            }
          },
          onLinkClick: (index, event) => {
            if (disabled) return;

            const edge = getEdgeByIndex(index);
            if (edge) {
              onEdgeClick?.(edge, event as never);
            }
          },
          onLinkMouseOver: index => {
            const edge = getEdgeByIndex(index);
            if (!edge) return;

            hoveredEdgeIdRef.current = edge.id;
            setHoveredEdgeId(edge.id);
            onEdgePointerOver?.(edge, undefined as never);
          },
          onLinkMouseOut: event => {
            const edge = preparedRef.current.edges.find(
              e => e.id === hoveredEdgeIdRef.current
            );

            hoveredEdgeIdRef.current = null;
            setHoveredEdgeId(null);

            if (edge) {
              onEdgePointerOut?.(edge, event as never);
            }
          }
        }),
      [
        collapsedNodeIds,
        cosmosConfig,
        defaultNodeSize,
        disabled,
        draggable,
        edgeArrowPosition,
        edgeInterpolation,
        getEdgeByIndex,
        getNodeByIndex,
        onCanvasClick,
        onEdgeClick,
        onEdgePointerOut,
        onEdgePointerOver,
        onNodeClick,
        onNodePointerOut,
        onNodePointerOver,
        theme
      ]
    );

    useEffect(() => {
      if (!containerRef.current || cosmosRef.current) {
        return undefined;
      }

      const graph = new CosmosGraph(containerRef.current, config);
      cosmosRef.current = graph;

      return () => {
        graph.destroy();
        cosmosRef.current = null;
      };
      // Create the cosmos renderer once; config updates are applied below.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
      const container = containerRef.current;
      if (!container || typeof ResizeObserver === 'undefined') {
        return undefined;
      }

      const observer = new ResizeObserver(() => {
        const graph = cosmosRef.current;
        if (!graph || !container.clientWidth || !container.clientHeight) {
          return;
        }

        resizeCosmosGraph(graph);
        graph.render(animated ? undefined : 0);

        if (!didFitViewRef.current && preparedRef.current.nodes.length) {
          graph.fitView(0, 0.1);
          didFitViewRef.current = true;
        }
      });

      observer.observe(container);

      return () => {
        observer.disconnect();
      };
    }, [animated]);

    useEffect(() => {
      cosmosRef.current?.setConfig(config);
    }, [config]);

    useEffect(() => {
      let cancelled = false;

      async function updateGraph() {
        const prepared = await prepareCosmosGraph({
          graph: graphRef.current,
          nodes,
          edges,
          aggregateEdges,
          collapsedNodeIds,
          clusterAttribute,
          defaultNodeSize,
          labelType,
          layoutOverrides,
          layoutType,
          maxNodeSize,
          minNodeSize,
          sizingAttribute,
          sizingType
        });

        if (!cancelled) {
          preparedRef.current = prepared;
          setPreparedGraph(prepared);
        }
      }

      updateGraph();

      return () => {
        cancelled = true;
      };
    }, [
      aggregateEdges,
      collapsedNodeIds,
      clusterAttribute,
      defaultNodeSize,
      edges,
      labelType,
      layoutOverrides,
      layoutType,
      maxNodeSize,
      minNodeSize,
      nodes,
      sizingAttribute,
      sizingType
    ]);

    useEffect(() => {
      const graph = cosmosRef.current;
      if (!graph) {
        return undefined;
      }

      const activeEdgeIds = new Set(actives);
      const colorActiveEdgeIds = new Set(actives);
      const activeNodeIds = new Set(actives);
      if (hoveredEdgeId) {
        colorActiveEdgeIds.add(hoveredEdgeId);
      }
      if (hoveredNodeId) {
        activeNodeIds.add(hoveredNodeId);
      }

      const buffers = buildCosmosBuffers({
        activeEdgeIds,
        activeNodeIds,
        colorActiveEdgeIds,
        defaultNodeSize,
        edgeArrowPosition,
        hasSelections: selections.length > 0,
        preparedGraph,
        selectedIds: new Set(selections),
        theme
      });

      applyCosmosBuffers(graph, buffers, animated);

      const frameId = requestAnimationFrame(() => {
        if (cosmosRef.current !== graph) {
          return;
        }

        resizeCosmosGraph(graph);

        if (!didFitViewRef.current && preparedGraph.nodes.length) {
          graph.fitView(0, 0.1);
          didFitViewRef.current = true;
        }

        graph.render(animated ? undefined : 0);
      });

      return () => {
        cancelAnimationFrame(frameId);
      };
    }, [
      actives,
      animated,
      defaultNodeSize,
      edgeArrowPosition,
      hoveredEdgeId,
      hoveredNodeId,
      preparedGraph,
      selections,
      theme
    ]);

    return (
      <div className={css.canvas}>
        <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      </div>
    );
  }
);
