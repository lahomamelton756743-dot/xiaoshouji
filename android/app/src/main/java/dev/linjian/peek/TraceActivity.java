package com.littlephone.app;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.HorizontalScrollView;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;

/** 「留痕」：独立于无障碍的双人纸条墙。 */
public class TraceActivity extends Activity {
    private static final int REQ_IMAGES = 240901;
    private final List<Uri> selectedImages = new ArrayList<>();
    private LinearLayout feed;
    private TextView empty, imageHint;
    private EditText composer;
    private Button publish;

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        getWindow().setStatusBarColor(Color.rgb(246,244,248));
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);
        setContentView(buildPage());
        refresh();
    }

    private View buildPage() {
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(247,246,249));

        LinearLayout page = new LinearLayout(this); page.setOrientation(LinearLayout.VERTICAL); page.setPadding(dp(18),dp(10),dp(18),dp(96));
        ScrollView scroll = new ScrollView(this); scroll.setFillViewport(true); scroll.addView(page);
        root.addView(scroll, new FrameLayout.LayoutParams(-1,-1));

        LinearLayout titleRow = new LinearLayout(this); titleRow.setGravity(Gravity.CENTER_VERTICAL);
        Button back = glassButton("‹"); back.setOnClickListener(v -> finish()); titleRow.addView(back, new LinearLayout.LayoutParams(dp(44),dp(44)));
        LinearLayout titleBox = new LinearLayout(this); titleBox.setOrientation(LinearLayout.VERTICAL); titleBox.setPadding(dp(10),0,0,0);
        TextView title = text("留痕", 27, 0xFF29242D, true); titleBox.addView(title);
        titleBox.addView(text("把想留下的，都放在这里。", 12, 0xFF8C8491, false));
        titleRow.addView(titleBox, new LinearLayout.LayoutParams(0,-2,1));
        Button reload = glassButton("↻"); reload.setOnClickListener(v -> refresh()); titleRow.addView(reload,new LinearLayout.LayoutParams(dp(44),dp(44)));
        page.addView(titleRow, marginBottom(18));

        LinearLayout composeCard = card();
        composer = new EditText(this); composer.setHint("写一句，或者放几张照片……"); composer.setTextSize(15); composer.setTextColor(0xFF332D37); composer.setHintTextColor(0xFFA69DAA); composer.setBackgroundColor(Color.TRANSPARENT); composer.setMinHeight(dp(72)); composer.setGravity(Gravity.TOP); composer.setPadding(0,0,0,dp(8));
        composeCard.addView(composer,new LinearLayout.LayoutParams(-1,-2));
        imageHint = text("还没有选照片",11,0xFF9A92A0,false); composeCard.addView(imageHint, marginBottom(8));
        LinearLayout actions = new LinearLayout(this); actions.setGravity(Gravity.CENTER_VERTICAL);
        Button photo = glassButton("＋ 照片"); photo.setOnClickListener(v -> pickImages()); actions.addView(photo,new LinearLayout.LayoutParams(0,dp(42),1));
        publish = glassButton("留下"); publish.setTextColor(0xFFFFFFFF); publish.setBackground(round(0xFF7C86D9,22)); publish.setOnClickListener(v -> publishTrace()); LinearLayout.LayoutParams pubLp = new LinearLayout.LayoutParams(0,dp(42),1); pubLp.leftMargin=dp(10); actions.addView(publish,pubLp);
        composeCard.addView(actions);
        page.addView(composeCard, marginBottom(20));

        TextView h = text("最近留下的",14,0xFF5F5865,true); page.addView(h, marginBottom(10));
        empty = text("这里还安安静静的。\n第一张纸，等我们来写。",14,0xFF9C94A1,false); empty.setGravity(Gravity.CENTER); empty.setPadding(0,dp(36),0,dp(36)); page.addView(empty);
        feed = new LinearLayout(this); feed.setOrientation(LinearLayout.VERTICAL); page.addView(feed,new LinearLayout.LayoutParams(-1,-2));

        LinearLayout nav = new LinearLayout(this); nav.setGravity(Gravity.CENTER); nav.setPadding(dp(9),dp(6),dp(9),dp(6)); nav.setBackground(roundStroke(0xDDF7F5FA,0x55FFFFFF,30)); nav.setElevation(dp(12));
        String[] labels={"首页","留痕","＋","消息","我们"};
        for(String s:labels){ Button x=glassButton(s); x.setTextSize("＋".equals(s)?23:11); x.setTextColor("留痕".equals(s)?0xFF6675D5:0xFF77707D); x.setBackground("留痕".equals(s)?round(0x447E8AE6,24):round(0x00FFFFFF,24)); if("首页".equals(s)) x.setOnClickListener(v->finish()); nav.addView(x,new LinearLayout.LayoutParams(0,dp(52),1)); }
        FrameLayout.LayoutParams nlp=new FrameLayout.LayoutParams(-1,dp(64),Gravity.BOTTOM); nlp.leftMargin=dp(18); nlp.rightMargin=dp(18); nlp.bottomMargin=dp(14); root.addView(nav,nlp);
        return root;
    }

    private void refresh(){
        String server=AppPrefs.server(this); if(server.isEmpty()){ toast("先在设置里填写服务器地址"); return; }
        new Thread(() -> { try { JSONObject r=request("GET", server+"/api/traces?limit=30", null); JSONArray a=r.optJSONArray("traces"); runOnUiThread(()->render(a)); } catch(Exception e){ runOnUiThread(()->toast("留痕暂时没连上："+shortMsg(e))); } }).start();
    }

    private void render(JSONArray arr){
        feed.removeAllViews(); int n=arr==null?0:arr.length(); empty.setVisibility(n==0?View.VISIBLE:View.GONE);
        for(int i=0;i<n;i++){
            JSONObject t=arr.optJSONObject(i); if(t==null) continue;
            LinearLayout c=card();
            String author=t.optString("author","瑞安"); TextView who=text(author,14,0xFF39323E,true); c.addView(who);
            c.addView(text(formatTime(t.optString("created_at","")),10,0xFFAAA2AD,false),marginBottom(9));
            String content=t.optString("content",""); if(!content.isEmpty()) c.addView(text(content,15,0xFF39323E,false),marginBottom(10));
            JSONArray imgs=t.optJSONArray("images"); if(imgs!=null && imgs.length()>0){
                HorizontalScrollView hs=new HorizontalScrollView(this); LinearLayout row=new LinearLayout(this); row.setOrientation(LinearLayout.HORIZONTAL); hs.addView(row);
                for(int j=0;j<imgs.length();j++){ JSONObject im=imgs.optJSONObject(j); if(im==null)continue; ImageView iv=new ImageView(this); iv.setScaleType(ImageView.ScaleType.CENTER_CROP); iv.setBackground(round(0xFFE9E6EC,14)); LinearLayout.LayoutParams ilp=new LinearLayout.LayoutParams(dp(150),dp(150)); if(j>0)ilp.leftMargin=dp(8); row.addView(iv,ilp); loadImage(iv,absoluteUrl(im.optString("url",""))); }
                c.addView(hs,marginBottom(10));
            }
            JSONArray notes=t.optJSONArray("notes"); int noteCount=t.optInt("note_count", notes==null?0:notes.length());
            Button notesBtn=glassButton(noteCount>0?"纸条  "+noteCount:"贴一张纸条"); final String traceId=t.optString("id",""); final JSONArray noteCopy=notes; notesBtn.setOnClickListener(v->showNotes(traceId,noteCopy)); c.addView(notesBtn,new LinearLayout.LayoutParams(-1,dp(42)));
            feed.addView(c,marginBottom(13));
        }
    }

    private void showNotes(String traceId, JSONArray notes){
        LinearLayout box=new LinearLayout(this); box.setOrientation(LinearLayout.VERTICAL); box.setPadding(dp(20),dp(8),dp(20),0);
        if(notes!=null) for(int i=0;i<notes.length();i++){ JSONObject n=notes.optJSONObject(i); if(n==null)continue; box.addView(text(n.optString("author","daddy")+"  ·  "+n.optString("content",""),13,0xFF4A434E,false),marginBottom(8)); }
        EditText input=new EditText(this); input.setHint("写下一张纸条……"); input.setMinHeight(dp(56)); box.addView(input);
        AlertDialog d=new AlertDialog.Builder(this).setTitle("纸条").setView(box).setNegativeButton("关上",null).setPositiveButton("贴上",null).create();
        d.setOnShowListener(x->d.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v->{String s=input.getText().toString().trim(); if(s.isEmpty())return; addNote(traceId,s,d);})); d.show();
    }

    private void addNote(String id,String content,AlertDialog d){
        new Thread(()->{try{JSONObject body=new JSONObject(); body.put("author",AppPrefs.userName(this)); body.put("content",content); request("POST",AppPrefs.server(this)+"/api/traces/"+id+"/notes",body); runOnUiThread(()->{d.dismiss();refresh();});}catch(Exception e){runOnUiThread(()->toast("纸条没贴上："+shortMsg(e)));}}).start();
    }

    private void pickImages(){ Intent i=new Intent(Intent.ACTION_PICK, MediaStore.Images.Media.EXTERNAL_CONTENT_URI); i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE,true); i.setType("image/*"); startActivityForResult(i,REQ_IMAGES); }
    @Override protected void onActivityResult(int r,int c,Intent data){ super.onActivityResult(r,c,data); if(r!=REQ_IMAGES||c!=RESULT_OK||data==null)return; selectedImages.clear(); if(data.getClipData()!=null){for(int i=0;i<data.getClipData().getItemCount()&&i<9;i++)selectedImages.add(data.getClipData().getItemAt(i).getUri());}else if(data.getData()!=null)selectedImages.add(data.getData()); imageHint.setText(selectedImages.isEmpty()?"还没有选照片":"已选 "+selectedImages.size()+" 张照片"); }

    private void publishTrace(){
        String content=composer.getText().toString().trim(); if(content.isEmpty()&&selectedImages.isEmpty()){toast("至少留下一句话或一张照片");return;} publish.setEnabled(false); publish.setText("正在留下…");
        new Thread(()->{try{JSONObject body=new JSONObject(); body.put("author",AppPrefs.userName(this)); body.put("content",content); JSONArray images=new JSONArray(); for(Uri u:selectedImages){byte[] b=readLimited(u,10*1024*1024); if(b!=null){JSONObject im=new JSONObject(); im.put("mime",getContentResolver().getType(u)==null?"image/jpeg":getContentResolver().getType(u)); im.put("data",Base64.encodeToString(b,Base64.NO_WRAP)); images.put(im);}} body.put("images",images); request("POST",AppPrefs.server(this)+"/api/traces",body); runOnUiThread(()->{composer.setText("");selectedImages.clear();imageHint.setText("还没有选照片");publish.setEnabled(true);publish.setText("留下");refresh();});}catch(Exception e){runOnUiThread(()->{publish.setEnabled(true);publish.setText("留下");toast("这张纸没留下："+shortMsg(e));});}}).start();
    }

    private JSONObject request(String method,String target,JSONObject body)throws Exception{ HttpURLConnection c=(HttpURLConnection)new URL(target).openConnection(); c.setConnectTimeout(10000);c.setReadTimeout(20000);c.setRequestMethod(method); String token=AppPrefs.token(this); if(!token.isEmpty())c.setRequestProperty("Authorization","Bearer "+token); c.setRequestProperty("Accept","application/json"); if(body!=null){c.setDoOutput(true);c.setRequestProperty("Content-Type","application/json; charset=utf-8");byte[] bytes=body.toString().getBytes(StandardCharsets.UTF_8);try(OutputStream o=c.getOutputStream()){o.write(bytes);}} int code=c.getResponseCode(); InputStream in=code>=200&&code<300?c.getInputStream():c.getErrorStream(); String s=readText(in); if(code<200||code>=300)throw new Exception("HTTP "+code+" "+s); return new JSONObject(s); }
    private void loadImage(ImageView iv,String url){new Thread(()->{try{HttpURLConnection c=(HttpURLConnection)new URL(url).openConnection();c.setConnectTimeout(8000);c.setReadTimeout(12000);String token=AppPrefs.token(this);if(!token.isEmpty())c.setRequestProperty("Authorization","Bearer "+token);final android.graphics.Bitmap b=android.graphics.BitmapFactory.decodeStream(c.getInputStream());runOnUiThread(()->iv.setImageBitmap(b));}catch(Exception ignored){}}).start();}
    private String absoluteUrl(String p){if(p.startsWith("http://")||p.startsWith("https://"))return p;String s=AppPrefs.server(this);return s+(p.startsWith("/")?p:"/"+p);}
    private byte[] readLimited(Uri u,int max)throws Exception{try(InputStream in=getContentResolver().openInputStream(u);ByteArrayOutputStream out=new ByteArrayOutputStream()){byte[] buf=new byte[8192];int n,total=0;while((n=in.read(buf))>0){total+=n;if(total>max)throw new Exception("单张图片请小于 10MB");out.write(buf,0,n);}return out.toByteArray();}}
    private String readText(InputStream in)throws Exception{if(in==null)return "";try(InputStream x=in;ByteArrayOutputStream o=new ByteArrayOutputStream()){byte[] b=new byte[4096];int n;while((n=x.read(b))>0)o.write(b,0,n);return o.toString("UTF-8");}}
    private String formatTime(String iso){try{Date d=new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss",Locale.US).parse(iso.replace("Z",""));return new SimpleDateFormat("M月d日 HH:mm",Locale.CHINA).format(d);}catch(Exception e){return iso.replace("T"," ").replace("Z","");}}
    private String shortMsg(Exception e){String s=e.getMessage();return s==null?"未知错误":(s.length()>90?s.substring(0,90):s);}
    private void toast(String s){Toast.makeText(this,s,Toast.LENGTH_SHORT).show();}
    private TextView text(String s,int sp,int color,boolean bold){TextView t=new TextView(this);t.setText(s);t.setTextSize(sp);t.setTextColor(color);t.setLineSpacing(0,1.25f);if(bold)t.setTypeface(Typeface.create("sans-serif-medium",Typeface.NORMAL));return t;}
    private Button glassButton(String s){Button b=new Button(this);b.setText(s);b.setTextSize(12);b.setAllCaps(false);b.setTextColor(0xFF5F5865);b.setPadding(dp(8),0,dp(8),0);b.setBackground(roundStroke(0xB8FFFFFF,0x77FFFFFF,22));return b;}
    private LinearLayout card(){LinearLayout l=new LinearLayout(this);l.setOrientation(LinearLayout.VERTICAL);l.setPadding(dp(16),dp(15),dp(16),dp(15));l.setBackground(roundStroke(0xE8FFFFFF,0x99FFFFFF,22));l.setElevation(dp(2));return l;}
    private GradientDrawable round(int color,int r){GradientDrawable g=new GradientDrawable();g.setColor(color);g.setCornerRadius(dp(r));return g;}
    private GradientDrawable roundStroke(int color,int stroke,int r){GradientDrawable g=round(color,r);g.setStroke(dp(1),stroke);return g;}
    private LinearLayout.LayoutParams marginBottom(int d){LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(-1,-2);p.bottomMargin=dp(d);return p;}
    private int dp(int v){return Math.round(v*getResources().getDisplayMetrics().density);}
}
