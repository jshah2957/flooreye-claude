import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Image,
} from "react-native";
import { useRouter } from "expo-router";
import { useIsFocused } from "@react-navigation/native";
import api from "@/services/api";
import {
  BRAND,
  DETECTION,
  SPACING,
  RADIUS,
  FONT_SIZE,
  NEUTRAL,
} from "@/constants/theme";
import {
  PAGINATION,
  API_LIMITS,
  RETENTION,
} from "@/constants/config";
import { DetectionListItem } from "@/types";
import ErrorBanner from "@/components/shared/ErrorBanner";
import EmptyState from "@/components/shared/EmptyState";

type FilterType = "all" | "wet" | "dry";

const FILTERS: { key: FilterType; label: string }[] = [
  { key: "all", label: "All" },
  { key: "wet", label: "Wet" },
  { key: "dry", label: "Dry" },
];

/** Simple LRU cache for thumbnail base64 strings. */
class LRUCache {
  private map = new Map<string, string>();
  private readonly maxSize: number;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }

  get(key: string): string | undefined {
    const val = this.map.get(key);
    if (val !== undefined) {
      // Move to end (most recently used)
      this.map.delete(key);
      this.map.set(key, val);
    }
    return val;
  }

  set(key: string, value: string): void {
    if (this.map.has(key)) {
      this.map.delete(key);
    } else if (this.map.size >= this.maxSize) {
      // Evict oldest (first entry)
      const firstKey = this.map.keys().next().value;
      if (firstKey !== undefined) {
        this.map.delete(firstKey);
      }
    }
    this.map.set(key, value);
  }

  has(key: string): boolean {
    return this.map.has(key);
  }

  snapshot(): Record<string, string> {
    const obj: Record<string, string> = {};
    this.map.forEach((v, k) => {
      obj[k] = v;
    });
    return obj;
  }
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  if (diffMs < 0) return "just now";
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function HistoryScreen() {
  const router = useRouter();
  const isFocused = useIsFocused();
  const [detections, setDetections] = useState<DetectionListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterType>("all");
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [thumbMap, setThumbMap] = useState<Record<string, string>>({});

  const thumbCacheRef = useRef(new LRUCache(RETENTION.MAX_THUMBNAILS_CACHED));

  const fetchThumbnails = useCallback(async (items: DetectionListItem[]) => {
    const cache = thumbCacheRef.current;
    const needed = items.filter((d) => !cache.has(d.id));
    if (needed.length === 0) return;

    // Fetch in batches
    for (let i = 0; i < needed.length; i += API_LIMITS.THUMBNAIL_BATCH_SIZE) {
      const batch = needed.slice(i, i + API_LIMITS.THUMBNAIL_BATCH_SIZE);
      const results = await Promise.all(
        batch.map(async (item) => {
          try {
            const res = await api.get(`/mobile/detections/${item.id}/frame`);
            const base64: string | undefined = res.data.data?.frame_base64;
            return { id: item.id, base64: base64 ?? null };
          } catch {
            return { id: item.id, base64: null };
          }
        })
      );
      results.forEach(({ id, base64 }) => {
        if (base64) {
          cache.set(id, base64);
        }
      });
      setThumbMap(cache.snapshot());
    }
  }, []);

  const fetchDetections = useCallback(
    async (reset: boolean = true) => {
      try {
        setError(null);
        const newOffset = reset ? 0 : offset;
        const params: Record<string, string | number | boolean> = {
          limit: PAGINATION.DEFAULT_PAGE_SIZE,
          offset: newOffset,
        };
        if (filter === "wet") params.is_wet = true;
        if (filter === "dry") params.is_wet = false;

        const res = await api.get("/detection/history", { params });
        const data: DetectionListItem[] = res.data.data ?? [];
        const meta = res.data.meta ?? {};

        if (reset) {
          setDetections(data);
          setOffset(data.length);
        } else {
          setDetections((prev) => [...prev, ...data]);
          setOffset((prev) => prev + data.length);
        }
        setTotal(meta.total ?? 0);

        fetchThumbnails(data);
      } catch (err: any) {
        const msg =
          err?.response?.data?.detail ??
          err?.message ??
          "Failed to load detection history";
        setError(msg);
      } finally {
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
      }
    },
    [filter, offset, fetchThumbnails]
  );

  // Reset on filter change
  useEffect(() => {
    setLoading(true);
    setDetections([]);
    setOffset(0);
    fetchDetections(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  // Refresh on screen focus
  useEffect(() => {
    if (isFocused && !loading) {
      fetchDetections(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFocused]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    setOffset(0);
    fetchDetections(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchDetections]);

  const handleLoadMore = useCallback(() => {
    if (loadingMore || detections.length >= total) return;
    setLoadingMore(true);
    fetchDetections(false);
  }, [loadingMore, detections.length, total, fetchDetections]);

  const handleRetry = useCallback(() => {
    setLoading(true);
    fetchDetections(true);
  }, [fetchDetections]);

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: BRAND.background,
          gap: 12,
        }}
        accessibilityLabel="Loading detection history"
      >
        <ActivityIndicator size="large" color={BRAND.primary} />
        <Text style={{ fontSize: 14, color: BRAND.textSecondary }}>
          Loading history...
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: BRAND.background }}>
      <Text
        style={{
          fontSize: 20,
          fontWeight: "700",
          color: BRAND.textPrimary,
          padding: 16,
          paddingBottom: 10,
        }}
        accessibilityRole="header"
        accessibilityLabel="Detection History"
      >
        Detection History
      </Text>

      {/* Filter Pills */}
      <View
        style={{
          flexDirection: "row",
          paddingHorizontal: 16,
          paddingBottom: 10,
          gap: 8,
        }}
        accessibilityLabel="Filter detections"
      >
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={f.key}
            onPress={() => setFilter(f.key)}
            accessibilityRole="button"
            accessibilityLabel={`Filter ${f.label}`}
            accessibilityState={{ selected: filter === f.key }}
            style={{
              height: 40,
              minWidth: 60,
              justifyContent: "center",
              alignItems: "center",
              backgroundColor:
                filter === f.key ? BRAND.primary : "#F3F4F6",
              borderRadius: 20,
              paddingHorizontal: 20,
            }}
          >
            <Text
              style={{
                fontSize: 14,
                fontWeight: "600",
                color:
                  filter === f.key ? NEUTRAL.white : "#78716C",
              }}
            >
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Error */}
      {error && (
        <View style={{ paddingHorizontal: 16 }}>
          <ErrorBanner message={error} onRetry={handleRetry} />
        </View>
      )}

      <FlatList
        data={detections}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{
          padding: 16,
          paddingTop: 4,
          gap: 8,
          flexGrow: 1,
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={BRAND.primary}
          />
        }
        onEndReached={handleLoadMore}
        onEndReachedThreshold={PAGINATION.INFINITE_SCROLL_THRESHOLD}
        ListEmptyComponent={
          <EmptyState
            message="No detections found"
          />
        }
        ListFooterComponent={
          loadingMore ? (
            <View
              style={{
                height: 48,
                flexDirection: "row",
                justifyContent: "center",
                alignItems: "center",
                gap: 8,
              }}
              accessibilityLabel="Loading more detections"
            >
              <ActivityIndicator size="small" color={BRAND.primary} />
              <Text style={{ fontSize: 13, color: BRAND.textSecondary }}>
                Loading more...
              </Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <DetectionCard
            detection={item}
            thumbnail={thumbMap[item.id]}
            onPress={() => router.push(`/alert/${item.id}`)}
          />
        )}
      />
    </View>
  );
}

function DetectionCard({
  detection,
  thumbnail,
  onPress,
}: {
  detection: DetectionListItem;
  thumbnail?: string;
  onPress: () => void;
}) {
  const isWet = detection.is_wet;
  const badge = isWet ? DETECTION.wet : DETECTION.dry;
  const badgeLabel = isWet ? "WET" : "DRY";

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`${badgeLabel} detection, ${(detection.confidence * 100).toFixed(1)}% confidence, ${timeAgo(detection.timestamp)}`}
      style={{
        flexDirection: "row",
        backgroundColor: BRAND.surface,
        borderRadius: 12,
        overflow: "hidden",
        minHeight: 80,
        borderWidth: detection.is_flagged ? 1 : 0,
        borderColor: detection.is_flagged ? "#F59E0B" : "transparent",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 3,
        elevation: 2,
      }}
    >
      {/* Thumbnail */}
      <View
        style={{
          width: 88,
          height: 66,
          backgroundColor: "#E5E7EB",
          borderRadius: 8,
          margin: 8,
          marginRight: 0,
          overflow: "hidden",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        {thumbnail ? (
          <Image
            source={{ uri: `data:image/jpeg;base64,${thumbnail}` }}
            style={{ width: 88, height: 66 }}
            resizeMode="cover"
            accessibilityLabel="Detection frame thumbnail"
          />
        ) : (
          <Text
            style={{ fontSize: 11, color: BRAND.textSecondary }}
          >
            No frame
          </Text>
        )}
      </View>

      {/* Content */}
      <View style={{ flex: 1, padding: 12 }}>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <View
            style={{
              flexDirection: "row",
              gap: 8,
              alignItems: "center",
            }}
          >
            {/* Wet/Dry badge */}
            <View
              style={{
                backgroundColor: badge.bg,
                borderRadius: 6,
                paddingHorizontal: 10,
                paddingVertical: 3,
              }}
            >
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: "600",
                  color: badge.text,
                }}
              >
                {badgeLabel}
              </Text>
            </View>

            {/* Confidence */}
            <Text
              style={{
                fontSize: 16,
                fontWeight: "700",
                color: BRAND.textPrimary,
              }}
            >
              {(detection.confidence * 100).toFixed(1)}%
            </Text>

            {/* Flagged badge */}
            {detection.is_flagged && (
              <View
                style={{
                  backgroundColor: DETECTION.flagged.bg,
                  borderRadius: 6,
                  paddingHorizontal: 8,
                  paddingVertical: 3,
                }}
              >
                <Text
                  style={{
                    fontSize: 10,
                    fontWeight: "700",
                    color: DETECTION.flagged.text,
                  }}
                >
                  FLAGGED
                </Text>
              </View>
            )}
          </View>

          <Text
            style={{
              fontSize: 12,
              color: BRAND.textSecondary,
            }}
          >
            {timeAgo(detection.timestamp)}
          </Text>
        </View>

        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: 6,
          }}
        >
          <Text
            style={{
              fontSize: 12,
              color: BRAND.textSecondary,
            }}
            numberOfLines={1}
          >
            Camera: {detection.camera_id.slice(0, 8)}
          </Text>
          <Text
            style={{
              fontSize: 12,
              color: BRAND.textSecondary,
            }}
          >
            {(detection.wet_area_percent * 100).toFixed(1)}% area
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}
