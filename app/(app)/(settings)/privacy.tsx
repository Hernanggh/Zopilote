import { View, Text, ScrollView } from 'react-native';
import { Stack } from 'expo-router';
import { Colors, Fonts } from '@/constants/colors';

function Section({ title, children }: { title: string; children: string }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontFamily: Fonts.mono, fontSize: 10, letterSpacing: 1.5, color: Colors.textSecondary }}>{title}</Text>
      <Text style={{ fontFamily: Fonts.serif, fontSize: 15, color: Colors.text, lineHeight: 22 }}>{children}</Text>
    </View>
  );
}

export default function PrivacyScreen() {
  return (
    <ScrollView style={{ flex: 1, backgroundColor: Colors.background }} contentContainerStyle={{ padding: 20, gap: 20, paddingBottom: 60 }}>
      <Stack.Screen options={{ title: 'Política de Privacidad' }} />

      <View style={{ gap: 4 }}>
        <Text style={{ fontFamily: Fonts.serif, fontSize: 26, color: Colors.text }}>Política de Privacidad</Text>
        <Text style={{ fontFamily: Fonts.mono, fontSize: 10, color: Colors.textSecondary, letterSpacing: 0.5 }}>Zopilote Golf — última actualización: mayo 2026</Text>
      </View>

      <Section title="1. INFORMACIÓN GENERAL">
        Zopilote Golf ("la Aplicación") es operada por sus desarrolladores. Esta Política de Privacidad describe cómo se recopila, utiliza y protege la información personal de los usuarios. Al utilizar la Aplicación, usted acepta las prácticas descritas en este documento.
      </Section>

      <Section title="2. DATOS QUE RECOPILAMOS">
        Recopilamos únicamente la información que usted proporciona directamente: dirección de correo electrónico, nombre, handicap de golf y marcadores de cada partida. No recopilamos datos de ubicación, lista de contactos, ni ninguna otra información del dispositivo.
      </Section>

      <Section title="3. FINALIDAD DEL TRATAMIENTO">
        Los datos recopilados se utilizan exclusivamente para el funcionamiento de la Aplicación: autenticar su identidad como usuario, mostrar sus partidas e historial, calcular resultados de juegos y enviar invitaciones a otras personas cuando usted lo solicite expresamente.
      </Section>

      <Section title="4. TRANSFERENCIA A TERCEROS">
        Sus datos se almacenan en servidores seguros provistos por Supabase Inc. El envío de correos electrónicos de invitación se realiza a través de Resend Inc. No vendemos, arrendamos ni compartimos su información personal con terceros con fines comerciales, publicitarios ni de ninguna otra índole.
      </Section>

      <Section title="5. CONSERVACIÓN DE DATOS">
        Sus datos se conservan mientras mantenga una cuenta activa en la Aplicación. Una vez eliminada su cuenta, los datos serán suprimidos en un plazo máximo de 30 días naturales, salvo obligación legal en contrario.
      </Section>

      <Section title="6. SEGURIDAD">
        El acceso a los datos está protegido mediante autenticación de usuarios y políticas de control de acceso a nivel de base de datos (Row Level Security). Únicamente usted y los participantes de sus partidas tienen acceso a su información. Las comunicaciones se realizan sobre conexiones cifradas (HTTPS/TLS).
      </Section>

      <Section title="7. DERECHOS DEL USUARIO">
        Usted tiene derecho a acceder, rectificar, cancelar u oponerse al tratamiento de sus datos personales. Para ejercer cualquiera de estos derechos, o para solicitar la eliminación de su cuenta, comuníquese a info@zopilotegolf.com. Atenderemos su solicitud en un plazo de 7 días hábiles.
      </Section>

      <Section title="8. COOKIES Y TECNOLOGÍAS SIMILARES">
        La versión web de la Aplicación puede utilizar almacenamiento local (localStorage) para mantener su sesión activa. No se utilizan cookies de seguimiento ni de publicidad.
      </Section>

      <Section title="9. MODIFICACIONES">
        Nos reservamos el derecho de actualizar esta Política de Privacidad en cualquier momento. Las modificaciones serán notificadas mediante la actualización de la fecha indicada al inicio de este documento. El uso continuado de la Aplicación tras dichos cambios implica su aceptación.
      </Section>

      <Section title="10. CONTACTO">
        Para cualquier consulta relacionada con esta Política de Privacidad: info@zopilotegolf.com
      </Section>
    </ScrollView>
  );
}
