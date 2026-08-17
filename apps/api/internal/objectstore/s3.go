package objectstore

import (
	"context"
	"fmt"
	"io"
	"net/url"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

type PutAuthorization struct {
	URL       string
	ExpiresAt time.Time
}

type Store interface {
	AuthorizePut(ctx context.Context, key, contentType string, size int64, lifetime time.Duration) (PutAuthorization, error)
	Read(ctx context.Context, key string, maximumBytes int64) ([]byte, error)
	PublicURL(key string) string
}

type S3Store struct {
	bucket    string
	publicURL string
	client    *s3.Client
	presigner *s3.PresignClient
	now       func() time.Time
}

type S3Config struct {
	Bucket          string
	PublicURL       string
	Endpoint        string
	Region          string
	AccessKeyID     string
	SecretAccessKey string
}

func NewS3Store(ctx context.Context, configuration S3Config) (*S3Store, error) {
	provider := credentials.NewStaticCredentialsProvider(
		configuration.AccessKeyID,
		configuration.SecretAccessKey,
		"",
	)
	awsConfiguration, err := awsconfig.LoadDefaultConfig(
		ctx,
		awsconfig.WithRegion(configuration.Region),
		awsconfig.WithCredentialsProvider(provider),
	)
	if err != nil {
		return nil, fmt.Errorf("load S3 configuration: %w", err)
	}

	client := s3.NewFromConfig(awsConfiguration, func(options *s3.Options) {
		options.BaseEndpoint = aws.String(configuration.Endpoint)
		options.UsePathStyle = true
	})
	return &S3Store{
		bucket:    configuration.Bucket,
		publicURL: strings.TrimRight(configuration.PublicURL, "/"),
		client:    client,
		presigner: s3.NewPresignClient(client),
		now:       func() time.Time { return time.Now().UTC() },
	}, nil
}

func (s *S3Store) AuthorizePut(
	ctx context.Context,
	key, contentType string,
	size int64,
	lifetime time.Duration,
) (PutAuthorization, error) {
	result, err := s.presigner.PresignPutObject(
		ctx,
		&s3.PutObjectInput{
			Bucket:        aws.String(s.bucket),
			Key:           aws.String(key),
			ContentType:   aws.String(contentType),
			ContentLength: aws.Int64(size),
		},
		func(options *s3.PresignOptions) {
			options.Expires = lifetime
		},
	)
	if err != nil {
		return PutAuthorization{}, fmt.Errorf("presign image upload: %w", err)
	}
	return PutAuthorization{
		URL:       result.URL,
		ExpiresAt: s.now().Add(lifetime),
	}, nil
}

func (s *S3Store) Read(
	ctx context.Context,
	key string,
	maximumBytes int64,
) ([]byte, error) {
	result, err := s.client.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		return nil, fmt.Errorf("read uploaded image: %w", err)
	}
	defer result.Body.Close()

	data, err := io.ReadAll(io.LimitReader(result.Body, maximumBytes+1))
	if err != nil {
		return nil, fmt.Errorf("read uploaded image body: %w", err)
	}
	if int64(len(data)) > maximumBytes {
		return nil, fmt.Errorf("uploaded image exceeds authorized size")
	}
	return data, nil
}

func (s *S3Store) PublicURL(key string) string {
	parts := strings.Split(key, "/")
	for index, part := range parts {
		parts[index] = url.PathEscape(part)
	}
	return s.publicURL + "/" + strings.Join(parts, "/")
}
