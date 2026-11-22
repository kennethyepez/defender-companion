# Native WebMessageListener exposes no annotated JavaScript reflection interface.

# ML Kit discovers these implementations and their constructors through manifest metadata.
# AGP 9 strict R8 otherwise strips the constructors (googlesamples/mlkit#1007, #1018).
-keep class com.google.mlkit.** implements com.google.firebase.components.ComponentRegistrar {
    public <init>();
    public java.util.List getComponents();
}

# The bundled decoder uses reflection over generated protocol fields and JNI descriptors.
-keep class * extends com.google.android.gms.internal.mlkit_vision_barcode_bundled.zzeh {
    <fields>;
}
-keepclasseswithmembernames,includedescriptorclasses class * {
    native <methods>;
}
