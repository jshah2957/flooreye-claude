import { useState, useRef } from "react";
import { View, Text, FlatList, Dimensions, TouchableOpacity, Image } from "react-native";
import { useRouter } from "expo-router";

const { width } = Dimensions.get("window");

const slides = [
  {
    title: "See Every Drop",
    subtitle: "AI-powered wet floor detection for your stores",
    description: "FloorEye uses advanced computer vision to detect spills and wet floors in real-time, helping prevent slip-and-fall accidents.",
    color: "#0D9488",
  },
  {
    title: "Instant Alerts",
    subtitle: "Get notified the moment a spill is detected",
    description: "Receive push notifications on your phone when a wet floor is detected. Acknowledge incidents and track response times.",
    color: "#2563EB",
  },
  {
    title: "Analytics & Insights",
    subtitle: "Understand patterns and improve safety",
    description: "View detection heatmaps, camera coverage, incident response times, and more. Export reports for compliance.",
    color: "#7C3AED",
  },
  {
    title: "Ready to Start",
    subtitle: "Sign in to your FloorEye account",
    description: "Your admin has already set up your stores and cameras. Just sign in to start monitoring.",
    color: "#16A34A",
  },
];

export default function OnboardingScreen() {
  const router = useRouter();
  const [currentIndex, setCurrentIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);

  const goNext = () => {
    if (currentIndex < slides.length - 1) {
      flatListRef.current?.scrollToIndex({ index: currentIndex + 1 });
      setCurrentIndex(currentIndex + 1);
    } else {
      router.replace("/login");
    }
  };

  const skip = () => router.replace("/login");

  return (
    <View style={{ flex: 1, backgroundColor: "#F8F7F4" }}>
      <FlatList
        ref={flatListRef}
        data={slides}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => {
          const idx = Math.round(e.nativeEvent.contentOffset.x / width);
          setCurrentIndex(idx);
        }}
        keyExtractor={(_, i) => String(i)}
        renderItem={({ item }) => (
          <View style={{ width, flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 32 }}>
            <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: item.color, opacity: 0.15, marginBottom: 24 }} />
            <Text style={{ fontSize: 28, fontWeight: "700", color: "#1C1917", textAlign: "center", marginBottom: 8 }}>
              {item.title}
            </Text>
            <Text style={{ fontSize: 16, fontWeight: "500", color: item.color, textAlign: "center", marginBottom: 16 }}>
              {item.subtitle}
            </Text>
            <Text style={{ fontSize: 14, color: "#78716C", textAlign: "center", lineHeight: 22 }}>
              {item.description}
            </Text>
          </View>
        )}
      />

      {/* Dots */}
      <View style={{ flexDirection: "row", justifyContent: "center", gap: 8, marginBottom: 16 }}>
        {slides.map((_, i) => (
          <View
            key={i}
            style={{
              width: currentIndex === i ? 24 : 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: currentIndex === i ? "#0D9488" : "#E7E5E0",
            }}
          />
        ))}
      </View>

      {/* Buttons */}
      <View style={{ flexDirection: "row", paddingHorizontal: 24, paddingBottom: 40, gap: 12 }}>
        {currentIndex < slides.length - 1 && (
          <TouchableOpacity onPress={skip} style={{ flex: 1, paddingVertical: 14, alignItems: "center" }}>
            <Text style={{ fontSize: 15, color: "#78716C" }}>Skip</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          onPress={goNext}
          style={{
            flex: 2,
            backgroundColor: "#0D9488",
            borderRadius: 12,
            paddingVertical: 14,
            alignItems: "center",
          }}
        >
          <Text style={{ fontSize: 15, fontWeight: "600", color: "#fff" }}>
            {currentIndex === slides.length - 1 ? "Get Started" : "Next"}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
